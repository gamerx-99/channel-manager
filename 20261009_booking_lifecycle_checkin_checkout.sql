-- Booking Lifecycle v1: permission-checked front-desk status transitions.
-- Additive schema change; run manually in the production Supabase SQL editor.
-- Verify with verify_20261009_booking_lifecycle_checkin_checkout.sql.

CREATE OR REPLACE FUNCTION public.transition_booking_status(
  target_booking_id uuid,
  target_hotel_id uuid,
  target_status text
)
RETURNS TABLE (
  booking_id uuid,
  hotel_id uuid,
  from_status text,
  to_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.hotel_users hu
      WHERE hu.user_id = auth.uid()
        AND hu.hotel_id = target_hotel_id
        AND hu.role IN ('hotel_owner', 'front_desk')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to check guests in or out.' USING ERRCODE = '42501';
  END IF;

  IF target_status NOT IN ('checked_in', 'checked_out') THEN
    RAISE EXCEPTION 'Unsupported booking status transition.' USING ERRCODE = '22023';
  END IF;

  SELECT b.status
  INTO current_status
  FROM public.bookings b
  WHERE b.id = target_booking_id
    AND b.hotel_id = target_hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (current_status = 'confirmed' AND target_status = 'checked_in')
    OR (current_status = 'checked_in' AND target_status = 'checked_out')
  ) THEN
    RAISE EXCEPTION 'Booking must be confirmed before check-in and checked in before check-out.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings b
  SET status = target_status
  WHERE b.id = target_booking_id
    AND b.hotel_id = target_hotel_id;

  INSERT INTO public.booking_status_log (booking_id, from_status, to_status, changed_by, reason)
  VALUES (
    target_booking_id,
    current_status,
    target_status,
    auth.uid(),
    CASE target_status
      WHEN 'checked_in' THEN 'front_desk_check_in'
      ELSE 'front_desk_check_out'
    END
  );

  RETURN QUERY SELECT target_booking_id, target_hotel_id, current_status, target_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_booking_status(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_booking_status(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.transition_booking_status(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.transition_booking_status(uuid, uuid, text) TO authenticated;
