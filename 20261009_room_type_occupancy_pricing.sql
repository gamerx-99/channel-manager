-- Per-room-type occupancy and child pricing configuration for the public booking flow.
ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS base_occupancy integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_occupancy integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS extra_guest_mode text NOT NULL DEFAULT 'per_person',
  ADD COLUMN IF NOT EXISTS extra_guest_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_guest_tier_percents numeric[] NOT NULL DEFAULT ARRAY[]::numeric[],
  ADD COLUMN IF NOT EXISTS child_rule text NOT NULL DEFAULT 'age',
  ADD COLUMN IF NOT EXISTS child_rule_limit numeric(6,2),
  ADD COLUMN IF NOT EXISTS child_price_mode text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS child_price_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS children_count_toward_max boolean NOT NULL DEFAULT true;

-- Preserve each existing room type's configured capacity as the initial max occupancy.
UPDATE public.room_types
SET max_occupancy = GREATEST(1, capacity),
    base_occupancy = LEAST(2, GREATEST(1, capacity));

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_occupancy_values_check,
  ADD CONSTRAINT room_types_occupancy_values_check CHECK (
    base_occupancy >= 1
    AND max_occupancy >= base_occupancy
    AND extra_guest_amount >= 0
    AND child_rule_limit >= 0
    AND child_price_value >= 0
    AND extra_guest_mode IN ('per_person', 'tiered_percent')
    AND child_rule IN ('age', 'height')
    AND child_price_mode IN ('free', 'fixed', 'percent')
  );

-- Update the selected room type and any hotel-wide child-rule reset in one RLS-scoped transaction.
CREATE OR REPLACE FUNCTION public.update_room_type_with_occupancy_config(
  target_hotel_id uuid,
  target_room_type_id uuid,
  target_name text,
  target_capacity integer,
  target_base_price numeric,
  target_occupancy_config jsonb
)
RETURNS SETOF public.room_types
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_child_rule text;
  next_child_rule text;
BEGIN
  IF jsonb_typeof(target_occupancy_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Room type occupancy configuration is invalid.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.room_types rt
  WHERE rt.hotel_id = target_hotel_id
  ORDER BY rt.id
  FOR UPDATE;

  SELECT rt.child_rule INTO current_child_rule
  FROM public.room_types rt
  WHERE rt.id = target_room_type_id AND rt.hotel_id = target_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room type not found.' USING ERRCODE = 'P0002';
  END IF;

  next_child_rule := COALESCE(target_occupancy_config->>'child_rule', current_child_rule);
  IF next_child_rule NOT IN ('age', 'height') THEN
    RAISE EXCEPTION 'Child measurement rule is invalid.' USING ERRCODE = '22023';
  END IF;

  IF next_child_rule IS DISTINCT FROM current_child_rule THEN
    UPDATE public.room_types rt
    SET child_rule = next_child_rule,
        child_rule_limit = NULL
    WHERE rt.hotel_id = target_hotel_id;
  END IF;

  RETURN QUERY
  UPDATE public.room_types rt
  SET name = target_name,
      capacity = target_capacity,
      base_price = target_base_price,
      base_occupancy = COALESCE((target_occupancy_config->>'base_occupancy')::integer, rt.base_occupancy),
      max_occupancy = COALESCE((target_occupancy_config->>'max_occupancy')::integer, target_capacity),
      extra_guest_mode = COALESCE(target_occupancy_config->>'extra_guest_mode', rt.extra_guest_mode),
      extra_guest_amount = COALESCE((target_occupancy_config->>'extra_guest_amount')::numeric, rt.extra_guest_amount),
      extra_guest_tier_percents = CASE WHEN target_occupancy_config ? 'extra_guest_tier_percents'
        THEN ARRAY(SELECT item.value::numeric
          FROM jsonb_array_elements_text(target_occupancy_config->'extra_guest_tier_percents') AS item(value))
        ELSE rt.extra_guest_tier_percents END,
      child_rule = next_child_rule,
      child_rule_limit = CASE WHEN target_occupancy_config ? 'child_rule_limit'
        THEN NULLIF(target_occupancy_config->>'child_rule_limit', '')::numeric
        WHEN next_child_rule IS DISTINCT FROM current_child_rule THEN NULL
        ELSE rt.child_rule_limit END,
      child_price_mode = COALESCE(target_occupancy_config->>'child_price_mode', rt.child_price_mode),
      child_price_value = COALESCE((target_occupancy_config->>'child_price_value')::numeric, rt.child_price_value),
      children_count_toward_max = COALESCE((target_occupancy_config->>'children_count_toward_max')::boolean, rt.children_count_toward_max)
  WHERE rt.id = target_room_type_id AND rt.hotel_id = target_hotel_id
  RETURNING rt.*;
END;
$$;

REVOKE ALL ON FUNCTION public.update_room_type_with_occupancy_config(uuid, uuid, text, integer, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_room_type_with_occupancy_config(uuid, uuid, text, integer, numeric, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_room_type_availability_for_guests(
  target_hotel_id uuid,
  target_check_in date,
  target_check_out date,
  target_adults integer,
  target_children jsonb
)
RETURNS TABLE (room_type_id uuid, rooms_available integer)
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
  IF target_adults IS NULL OR target_adults < 1 OR jsonb_typeof(target_children) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Guest counts are invalid.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(target_children) > 20 THEN
    RAISE EXCEPTION 'Guest counts are invalid.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible_room_types AS (
    SELECT rt.id
    FROM public.room_types rt
    JOIN public.hotels h ON h.id = rt.hotel_id
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE rt.child_rule_limit IS NOT NULL AND (
          (rt.child_rule = 'age' AND CASE
            WHEN jsonb_typeof(child.value->'age') = 'number' THEN (child.value->>'age')::numeric <= rt.child_rule_limit
            ELSE false
          END)
          OR (rt.child_rule = 'height' AND CASE
            WHEN jsonb_typeof(child.value->'height_cm') = 'number' THEN (child.value->>'height_cm')::numeric <= rt.child_rule_limit
            ELSE false
          END)
        ))::integer AS qualifying_children,
        COUNT(*) FILTER (WHERE
          rt.child_rule_limit IS NULL
          OR (rt.child_rule = 'age' AND CASE
            WHEN jsonb_typeof(child.value->'age') = 'number' THEN (child.value->>'age')::numeric > rt.child_rule_limit
            ELSE true
          END)
          OR (rt.child_rule = 'height' AND CASE
            WHEN jsonb_typeof(child.value->'height_cm') = 'number' THEN (child.value->>'height_cm')::numeric > rt.child_rule_limit
            ELSE true
          END)
        )::integer AS adult_equivalent_children
      FROM jsonb_array_elements(target_children) child(value)
    ) classified_children
    WHERE h.id = target_hotel_id
      AND h.public_enabled = true
      AND target_adults + classified_children.adult_equivalent_children
        + CASE WHEN rt.children_count_toward_max THEN classified_children.qualifying_children ELSE 0 END
        <= rt.max_occupancy
  ),
  room_inventory AS (
    SELECT eligible.id AS room_type_id, r.id AS room_id
    FROM eligible_room_types eligible
    JOIN public.rooms r ON r.room_type_id = eligible.id
    WHERE r.hotel_id = target_hotel_id
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
        OR (b.status IN ('held', 'pending_payment', 'pending_verification')
            AND (b.expires_at IS NULL OR b.expires_at >= now()))
      )
  )
  SELECT inventory.room_type_id,
    GREATEST(0, COUNT(DISTINCT inventory.room_id) - COUNT(DISTINCT occupied.room_id))::integer
  FROM room_inventory inventory
  LEFT JOIN occupied_rooms occupied ON occupied.room_id = inventory.room_id
  GROUP BY inventory.room_type_id
  HAVING COUNT(DISTINCT inventory.room_id) - COUNT(DISTINCT occupied.room_id) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_type_availability_for_guests(uuid, date, date, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_type_availability_for_guests(uuid, date, date, integer, jsonb) TO anon, authenticated;
