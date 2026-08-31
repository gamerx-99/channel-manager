-- Phase 12B: Payment flow — PromptPay QR + payment sessions + booking payment_status
-- Additive migration only. Safe to apply at any time.
-- Run in Supabase SQL editor.
-- Verify with: verify_20260908_add_payment_flow.sql

-- 1. Add promptpay_id and timeout to hotel_payment_settings
ALTER TABLE public.hotel_payment_settings
  ADD COLUMN IF NOT EXISTS promptpay_id text NULL,
  ADD COLUMN IF NOT EXISTS payment_timeout_minutes integer NOT NULL DEFAULT 15
    CHECK (payment_timeout_minutes BETWEEN 5 AND 60);

COMMENT ON COLUMN public.hotel_payment_settings.promptpay_id IS
  'PromptPay identifier: mobile number (0812345678), National ID (1234567890123), or Tax ID. Used to generate EMVCo QR.';
COMMENT ON COLUMN public.hotel_payment_settings.payment_timeout_minutes IS
  'QR payment session expiry in minutes (5–60). Default 15.';

-- 2. Add payment_status to bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'verified', 'failed'));

COMMENT ON COLUMN public.bookings.payment_status IS
  'Lifecycle: unpaid → pending (session created) → verified (SlipOK confirmed) | failed (verification failed)';

-- 3. Create payment_sessions table
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  hotel_id        uuid        NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
  qr_reference    text        NOT NULL,   -- unique ref embedded in the EMVCo QR string
  qr_string       text        NULL,       -- full EMVCo payload (server-generated)
  expires_at      timestamptz NOT NULL,
  verified_at     timestamptz NULL,
  slip_url        text        NULL,       -- path in Supabase Storage (optional)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for booking lookup
CREATE INDEX IF NOT EXISTS idx_payment_sessions_booking_id
  ON public.payment_sessions (booking_id);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_hotel_id
  ON public.payment_sessions (hotel_id);

-- RLS
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

-- Hotel members can view payment sessions for their hotels
CREATE POLICY "payment_sessions_select"
  ON public.payment_sessions FOR SELECT
  USING (public.is_hotel_member(hotel_id));

-- Hotel members (server-side via RLS client) can insert sessions
CREATE POLICY "payment_sessions_insert"
  ON public.payment_sessions FOR INSERT
  WITH CHECK (public.is_hotel_member(hotel_id));

-- Hotel members can update sessions (status transitions)
CREATE POLICY "payment_sessions_update"
  ON public.payment_sessions FOR UPDATE
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_payment_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS payment_sessions_updated_at ON public.payment_sessions;
CREATE TRIGGER payment_sessions_updated_at
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_payment_sessions_updated_at();
