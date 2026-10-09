-- Public booking inventory: let anonymous guests read room types only for published hotels.
-- Keep the hotels table private; the predicate function returns no hotel data.

CREATE OR REPLACE FUNCTION public.is_published_hotel(target_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hotels h
    WHERE h.id = target_hotel_id
      AND h.public_enabled = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_published_hotel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_published_hotel(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS room_types_public_select ON public.room_types;
CREATE POLICY room_types_public_select ON public.room_types
  FOR SELECT
  USING (
    public.is_published_hotel(hotel_id)
    OR public.is_hotel_member(hotel_id)
  );
