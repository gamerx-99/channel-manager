-- Public availability needs inventory counts but anonymous users cannot read rooms/bookings.
-- Return only per-room-type counts for hotels that have explicitly published their page.

CREATE OR REPLACE FUNCTION public.get_public_room_type_availability(
  target_hotel_id uuid,
  target_check_in date,
  target_check_out date
)
RETURNS TABLE (
  room_type_id uuid,
  rooms_available integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF target_check_in IS NULL OR target_check_out IS NULL OR target_check_out <= target_check_in THEN
    RAISE EXCEPTION 'Check-out date must be after check-in date.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH published_hotel AS (
    SELECT h.id
    FROM public.hotels h
    WHERE h.id = target_hotel_id
      AND h.public_enabled = true
  ),
  room_inventory AS (
    SELECT rt.id AS room_type_id, r.id AS room_id
    FROM public.room_types rt
    JOIN published_hotel h ON h.id = rt.hotel_id
    LEFT JOIN public.rooms r
      ON r.hotel_id = h.id
      AND r.room_type_id = rt.id
      AND r.status IS DISTINCT FROM 'maintenance'
  ),
  occupied_rooms AS (
    SELECT DISTINCT b.room_id
    FROM public.bookings b
    JOIN room_inventory inventory ON inventory.room_id = b.room_id
    WHERE b.check_in < target_check_out
      AND b.check_out > target_check_in
      AND (
        b.status IN ('confirmed', 'checked_in')
        OR (
          b.status IN ('held', 'pending_payment', 'pending_verification')
          AND (b.expires_at IS NULL OR b.expires_at >= now())
        )
      )
  )
  SELECT
    inventory.room_type_id,
    GREATEST(
      0,
      COUNT(DISTINCT inventory.room_id) - COUNT(DISTINCT occupied.room_id)
    )::integer AS rooms_available
  FROM room_inventory inventory
  LEFT JOIN occupied_rooms occupied ON occupied.room_id = inventory.room_id
  GROUP BY inventory.room_type_id
  ORDER BY inventory.room_type_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_type_availability(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_type_availability(uuid, date, date) TO anon, authenticated;
