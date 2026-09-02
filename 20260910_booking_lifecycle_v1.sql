-- Booking Lifecycle v1, Sub-phase A: state machine columns
-- Additive migration only. Safe to apply at any time.
-- Run in Supabase SQL editor.
-- Verify with: verify_20260910_booking_lifecycle_v1.sql
--
-- Context: public bookings are currently created as status='confirmed' immediately, before
-- payment is verified. If the customer abandons the flow, the room stays "occupied" forever with
-- no expiry or release mechanism. This migration adds the columns needed for a proper
-- HELD -> PENDING_PAYMENT -> PENDING_VERIFICATION -> CONFIRMED state machine with per-hotel
-- configurable hold/payment timers, expired via lazy-check-at-read-time (no cron dependency).

-- 1. Widen bookings.status to the full Phase 1 lifecycle.
--    Keeps 'confirmed'/'cancelled' with existing meaning; keeps 'checked_in'/'checked_out' in the
--    constraint (unused until the Phase 2 front-desk feature) so no future migration is needed to
--    re-add them.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'held',
    'pending_payment',
    'pending_verification',
    'confirmed',
    'expired',
    'payment_rejected',
    'cancelled',
    'refund_pending',
    'refunded',
    'checked_in',
    'checked_out'
  ));

-- 2. New columns on bookings for the state machine.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS payment_method text NULL
    CHECK (payment_method IN ('cash', 'transfer', 'promptpay')),
  ADD COLUMN IF NOT EXISTS late_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.expires_at IS
  'Deadline for the current HELD or PENDING_PAYMENT state. Checked lazily (now() > expires_at) at read/write time — no background sweep. NULL once CONFIRMED.';
COMMENT ON COLUMN public.bookings.payment_method IS
  'Set for walk-in/manual bookings created directly as confirmed. NULL for the online PromptPay flow (tracked via payment_sessions instead).';
COMMENT ON COLUMN public.bookings.created_by IS
  'Staff user who created this booking directly (walk-in/manual). NULL for public online bookings.';

CREATE INDEX IF NOT EXISTS idx_bookings_expires_at ON public.bookings (expires_at)
  WHERE expires_at IS NOT NULL;

-- 3. Per-hotel configurable Hold Timer (payment_timeout_minutes already exists from Phase 12B).
ALTER TABLE public.hotel_payment_settings
  ADD COLUMN IF NOT EXISTS hold_timeout_minutes integer NOT NULL DEFAULT 15
    CHECK (hold_timeout_minutes BETWEEN 5 AND 60);

COMMENT ON COLUMN public.hotel_payment_settings.hold_timeout_minutes IS
  'Minutes a room stays HELD (selected but guest details/payment not yet submitted) before it is released back to inventory. Default 15.';

-- 4. payment_sessions: persist SlipOK raw response + system-wide duplicate-ref protection.
ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS raw_response jsonb NULL,
  ADD COLUMN IF NOT EXISTS verified_transaction_ref text NULL;

COMMENT ON COLUMN public.payment_sessions.raw_response IS
  'Full raw JSON response from the SlipOK verification call (matched or not), kept for audit.';
COMMENT ON COLUMN public.payment_sessions.verified_transaction_ref IS
  'SlipOK transaction ref, set only once this session is matched=true. Unique system-wide to reject a slip reused across bookings.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_sessions_verified_ref_unique
  ON public.payment_sessions (verified_transaction_ref)
  WHERE verified_transaction_ref IS NOT NULL;

-- 5. Audit log for every booking status transition.
CREATE TABLE IF NOT EXISTS public.booking_status_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status text        NULL,
  to_status   text        NOT NULL,
  changed_by  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_status_log_booking_id
  ON public.booking_status_log (booking_id);

ALTER TABLE public.booking_status_log ENABLE ROW LEVEL SECURITY;

-- Hotel members can read the status history of bookings for their own hotels.
CREATE POLICY "booking_status_log_select"
  ON public.booking_status_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND public.is_hotel_member(b.hotel_id)
  ));

-- No INSERT/UPDATE/DELETE policy: writes go through the service-role (admin) client from server
-- logic only, matching the pattern used elsewhere for system-managed audit data.
