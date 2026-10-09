-- Persist booking party size and property-specific child measurements.
-- Additive and safe for existing bookings; production apply is owner-managed.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 1
    CHECK (adults BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0
    CHECK (children BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS child_measurements jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(child_measurements) = 'array');

-- Existing reservations get the room type's configured base occupancy when available.
UPDATE public.bookings b
SET adults = COALESCE(rt.base_occupancy, 1)
FROM public.rooms r
JOIN public.room_types rt ON rt.id = r.room_type_id
WHERE b.room_id = r.id
  AND b.adults = 1;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_child_measurements_count_check
  CHECK (jsonb_array_length(child_measurements) = children);

COMMENT ON COLUMN public.bookings.adults IS
  'Number of adults included in this reservation. Legacy rows are backfilled from room type base occupancy where available.';
COMMENT ON COLUMN public.bookings.children IS
  'Number of children included in this reservation.';
COMMENT ON COLUMN public.bookings.child_measurements IS
  'Per-child age or height_cm measurements according to the hotel room type child rule.';
