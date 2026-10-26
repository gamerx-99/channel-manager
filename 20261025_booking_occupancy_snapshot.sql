-- Run once in the Supabase SQL editor. Adds occupancy snapshot columns to bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adults_count integer,
  ADD COLUMN IF NOT EXISTS children_count integer;

COMMENT ON COLUMN public.bookings.adults_count IS 'Number of adults at time of booking (occupancy snapshot)';
COMMENT ON COLUMN public.bookings.children_count IS 'Number of children at time of booking (occupancy snapshot)';