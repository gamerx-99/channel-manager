-- B1: cancellation & refund policy per hotel + accepted-policy snapshot per booking.
-- Additive only; human applies in Supabase SQL editor (agent never runs live SQL).
-- Verify with: verify_20261013_cancellation_policy.sql
--
-- Model: one current policy per hotel (hotel_cancellation_policies, versioned by
-- bumping `version` on edit). Each booking pins the policy it accepted
-- (bookings.policy_snapshot + policy_accepted_at) so later edits never affect it.
-- Refund math lives in shared/cancellationPolicy.ts; the DB stores inputs + outcomes.

-- 1. Current policy per hotel (one row per hotel).
CREATE TABLE IF NOT EXISTS public.hotel_cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  free_cancellation_days integer NOT NULL DEFAULT 7
    CHECK (free_cancellation_days BETWEEN 0 AND 365),
  partial_keep_percent numeric(5,2) NOT NULL DEFAULT 50
    CHECK (partial_keep_percent BETWEEN 0 AND 100),
  partial_cutoff_days integer NOT NULL DEFAULT 3
    CHECK (partial_cutoff_days BETWEEN 0 AND 365),
  deposit_percent numeric(5,2) NOT NULL DEFAULT 30
    CHECK (deposit_percent BETWEEN 0 AND 100),
  no_show_keep_percent numeric(5,2) NOT NULL DEFAULT 100
    CHECK (no_show_keep_percent BETWEEN 0 AND 100),
  policy_text_th text NOT NULL DEFAULT '',
  policy_text_en text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_cancellation_policies_hotel_id_unique UNIQUE (hotel_id),
  CONSTRAINT hotel_cancellation_policies_cutoff_order
    CHECK (partial_cutoff_days <= free_cancellation_days)
);

ALTER TABLE public.hotel_cancellation_policies ENABLE ROW LEVEL SECURITY;

-- Public booking wizard must read the policy to show it before payment
-- (same shape as public room-type availability: service-role-safe read via
-- membership, plus an explicit anon/public read of non-secret policy fields).
DROP POLICY IF EXISTS "hotel_cancellation_policies_select" ON public.hotel_cancellation_policies;
CREATE POLICY "hotel_cancellation_policies_select"
  ON public.hotel_cancellation_policies FOR SELECT
  USING (public.is_hotel_member(hotel_id));

DROP POLICY IF EXISTS "hotel_cancellation_policies_public_read" ON public.hotel_cancellation_policies;
CREATE POLICY "hotel_cancellation_policies_public_read"
  ON public.hotel_cancellation_policies FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "hotel_cancellation_policies_upsert" ON public.hotel_cancellation_policies;
CREATE POLICY "hotel_cancellation_policies_upsert"
  ON public.hotel_cancellation_policies FOR INSERT
  WITH CHECK (public.is_hotel_member(hotel_id));

DROP POLICY IF EXISTS "hotel_cancellation_policies_update" ON public.hotel_cancellation_policies;
CREATE POLICY "hotel_cancellation_policies_update"
  ON public.hotel_cancellation_policies FOR UPDATE
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

-- 2. Accepted-policy snapshot + refund outcome on bookings.
-- Refund *state* reuses the existing bookings.status lifecycle
-- (cancelled -> refund_pending -> refunded); only the THB amount is stored here.
-- Named constraints + DO guards so the file is idempotent on re-run.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS policy_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_policy_snapshot_is_object') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_policy_snapshot_is_object
      CHECK (policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_refund_amount_nonnegative') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_refund_amount_nonnegative
      CHECK (refund_amount IS NULL OR refund_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.policy_snapshot IS
  'B1: accepted cancellation-policy snapshot {version, policy_text_th/en, free_cancellation_days, partial_keep_percent, partial_cutoff_days, deposit_percent, no_show_keep_percent}. NULL until the guest accepts before payment; later policy edits never touch this copy.';
COMMENT ON COLUMN public.bookings.policy_accepted_at IS
  'B1: when the guest accepted the policy snapshot (acceptance gate before payment).';
COMMENT ON COLUMN public.bookings.refund_amount IS
  'B1: THB the hotel must transfer back on cancel/no-show, computed from the snapshot at cancel time. NULL/0 = nothing owed.';

-- 3. updated_at trigger for the policy table.
CREATE OR REPLACE FUNCTION public.update_hotel_cancellation_policies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS hotel_cancellation_policies_updated_at ON public.hotel_cancellation_policies;
CREATE TRIGGER hotel_cancellation_policies_updated_at
  BEFORE UPDATE ON public.hotel_cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_hotel_cancellation_policies_updated_at();
