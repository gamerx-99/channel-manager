-- 20260907_add_booking_services.sql
-- Phase 12A: Booking Flow Core - Additional Services

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  pricing_model text NOT NULL CHECK (pricing_model IN ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: booking_services should be accessible if the user has access to the parent booking's hotel
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage services for bookings in their hotels"
  ON public.booking_services
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_services.booking_id
      AND public.is_hotel_member(b.hotel_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_booking_services_booking_id ON public.booking_services(booking_id);

COMMIT;
