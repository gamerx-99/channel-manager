-- Booking Lifecycle v1, Sub-phase D: hotel_services catalog
-- Additive migration only. Safe to apply at any time.
-- Run in Supabase SQL editor.
-- Verify with: verify_20260911_add_hotel_services_catalog.sql
--
-- Context: booking_services (20260907_add_booking_services.sql) only stores ad-hoc, per-booking
-- line items typed in by hand — there is no predefined catalog a hotel can set up once and reuse
-- across bookings. This migration adds that catalog. The public booking wizard (a later sub-phase)
-- will read active rows here to offer add-on services during checkout.

CREATE TABLE IF NOT EXISTS public.hotel_services (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid        NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  pricing_model text       NOT NULL CHECK (pricing_model IN ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
  unit_price   numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_services_hotel_id ON public.hotel_services (hotel_id);

ALTER TABLE public.hotel_services ENABLE ROW LEVEL SECURITY;

-- Hotel members (and super_admin) manage the full catalog, active or not.
CREATE POLICY "hotel_services_manage"
  ON public.hotel_services FOR ALL
  USING (public.is_super_admin() OR public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_super_admin() OR public.is_hotel_member(hotel_id));

-- Anonymous public callers (the booking wizard) may only see active services on published hotels
-- — mirrors room_types_public_select's shape exactly.
CREATE POLICY "hotel_services_public_select"
  ON public.hotel_services FOR SELECT
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.hotels h
      WHERE h.id = hotel_id AND h.public_enabled
    )
  );

CREATE OR REPLACE FUNCTION public.update_hotel_services_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS hotel_services_updated_at ON public.hotel_services;
CREATE TRIGGER hotel_services_updated_at
  BEFORE UPDATE ON public.hotel_services
  FOR EACH ROW EXECUTE FUNCTION public.update_hotel_services_updated_at();
