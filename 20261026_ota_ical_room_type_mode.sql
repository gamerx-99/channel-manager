-- iCal room-type mode: an OTA connection can map to a whole room type instead of one room.
-- Additive migration; run AFTER 20261026_ota_ical_room_sync.sql. Then run
-- verify_20261026_ota_ical_room_type_mode.sql (every row should read PASS).
--
-- Single-room connections (room_id set) behave exactly as before.
-- Room-type connections (room_type_id set):
-- * Import: each OTA event is placed on any free room of that type (a block keeps its room
--   when it still fits); an event that fits no room is returned as a conflict.
-- * Export: a date is closed only when EVERY non-maintenance room of the type is occupied,
--   counting all occupying bookings, including this OTA's own blocks (iCal cannot carry a
--   room count, so a full type must read as closed to every channel).
-- Known iCal limit (documented to hotels): two channels selling the last room of a type in
-- the same sync window can still double book; the conflict is then reported.

-- -----------------------------------------------------------------------------
-- 1. ota_connections.room_type_id, mutually exclusive with room_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.ota_connections
  ADD COLUMN IF NOT EXISTS room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL;

ALTER TABLE public.ota_connections DROP CONSTRAINT IF EXISTS ota_connections_single_target;
ALTER TABLE public.ota_connections
  ADD CONSTRAINT ota_connections_single_target CHECK (num_nonnulls(room_id, room_type_id) <= 1);

COMMENT ON COLUMN public.ota_connections.room_type_id IS
  'Room-type mode: OTA events are placed on any free room of this type, and the export closes a date only when the whole type is full. Mutually exclusive with room_id.';

CREATE OR REPLACE FUNCTION public.ota_connection_room_same_hotel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.id = NEW.room_id AND r.hotel_id = NEW.hotel_id
  ) THEN
    RAISE EXCEPTION 'The selected room does not belong to this hotel.' USING ERRCODE = '23514';
  END IF;
  IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types rt WHERE rt.id = NEW.room_type_id AND rt.hotel_id = NEW.hotel_id
  ) THEN
    RAISE EXCEPTION 'The selected room type does not belong to this hotel.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ota_connection_room_same_hotel() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ota_connection_room_same_hotel ON public.ota_connections;
CREATE TRIGGER trg_ota_connection_room_same_hotel
  BEFORE INSERT OR UPDATE OF room_id, room_type_id, hotel_id ON public.ota_connections
  FOR EACH ROW EXECUTE FUNCTION public.ota_connection_room_same_hotel();

-- -----------------------------------------------------------------------------
-- 2. sync_ota_ical_blocks: place events on the mapped room or on any free room of the type
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_ota_ical_blocks(target_connection_id uuid, events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  conn public.ota_connections%ROWTYPE;
  existing public.bookings%ROWTYPE;
  has_existing boolean;
  placed boolean;
  candidate uuid;
  candidates uuid[];
  target_room_ids uuid[];
  event jsonb;
  event_uid text;
  event_start date;
  event_end date;
  event_label text;
  local_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  seen_uids text[] := ARRAY[]::text[];
  inserted_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
  cancelled_count integer := 0;
  conflicts jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO conn FROM public.ota_connections WHERE id = target_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTA calendar connection not found.' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.can_manage_ical(conn.hotel_id) THEN
    RAISE EXCEPTION 'Not authorized to sync this OTA calendar.' USING ERRCODE = '42501';
  END IF;

  IF conn.room_id IS NOT NULL THEN
    target_room_ids := ARRAY[conn.room_id];
  ELSIF conn.room_type_id IS NOT NULL THEN
    SELECT array_agg(r.id ORDER BY r.room_number)
    INTO target_room_ids
    FROM public.rooms r
    WHERE r.room_type_id = conn.room_type_id
      AND r.hotel_id = conn.hotel_id
      AND r.status IS DISTINCT FROM 'maintenance';
    IF target_room_ids IS NULL OR cardinality(target_room_ids) = 0 THEN
      RAISE EXCEPTION 'This room type has no rooms that can be blocked.' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Choose the room or room type this calendar blocks before syncing.' USING ERRCODE = '22023';
  END IF;

  IF events IS NULL OR jsonb_typeof(events) <> 'array' OR jsonb_array_length(events) > 5000 THEN
    RAISE EXCEPTION 'iCal events must be an array of at most 5000 items.' USING ERRCODE = '22023';
  END IF;

  FOR event IN SELECT value FROM jsonb_array_elements(events) LOOP
    event_uid := left(nullif(trim(event->>'uid'), ''), 255);
    event_start := nullif(event->>'start', '')::date;
    event_end := nullif(event->>'end', '')::date;
    CONTINUE WHEN event_uid IS NULL OR event_start IS NULL OR event_end IS NULL
      OR event_end <= event_start OR event_end <= local_today
      OR event_uid = ANY(seen_uids);

    seen_uids := seen_uids || event_uid;
    event_label := left(conn.provider || coalesce(' · ' || nullif(trim(event->>'summary'), ''), ''), 160);

    SELECT * INTO existing
    FROM public.bookings
    WHERE ota_connection_id = conn.id AND external_uid = event_uid;
    has_existing := FOUND;

    -- Front desk already acted on this stay, or nothing changed: the feed never rewrites it.
    IF has_existing AND (
      existing.status IN ('checked_in', 'checked_out')
      OR (existing.check_in = event_start
        AND existing.check_out = event_end
        AND existing.status = 'confirmed'
        AND existing.room_id = ANY(target_room_ids))
    ) THEN
      unchanged_count := unchanged_count + 1;
      CONTINUE;
    END IF;

    -- Try the block's current room first so a date change does not shuffle rooms needlessly.
    candidates := CASE
      WHEN has_existing AND existing.room_id = ANY(target_room_ids)
        THEN ARRAY[existing.room_id] || array_remove(target_room_ids, existing.room_id)
      ELSE target_room_ids
    END;
    placed := false;

    FOREACH candidate IN ARRAY candidates LOOP
      BEGIN
        IF has_existing THEN
          UPDATE public.bookings
          SET check_in = event_start,
              check_out = event_end,
              room_id = candidate,
              guest_name = event_label,
              status = 'confirmed'
          WHERE id = existing.id;
        ELSE
          INSERT INTO public.bookings (
            hotel_id, room_id, guest_name, check_in, check_out, price, source, status,
            ota_connection_id, external_uid
          ) VALUES (
            conn.hotel_id, candidate, event_label, event_start, event_end, 0, 'ota_ical', 'confirmed',
            conn.id, event_uid
          );
        END IF;
        placed := true;
        EXIT;
      EXCEPTION WHEN exclusion_violation THEN
        -- This room is taken for those dates; try the next one.
        NULL;
      END;
    END LOOP;

    IF placed THEN
      IF has_existing THEN
        updated_count := updated_count + 1;
      ELSE
        inserted_count := inserted_count + 1;
      END IF;
    ELSE
      conflicts := conflicts || jsonb_build_object('uid', event_uid, 'start', event_start, 'end', event_end);
    END IF;
  END LOOP;

  -- Events removed from the feed (cancelled on the OTA side) release the room.
  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE ota_connection_id = conn.id
    AND status = 'confirmed'
    AND check_out > local_today
    AND NOT (external_uid = ANY(seen_uids));
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  UPDATE public.ota_connections
  SET last_sync_at = now(),
      updated_at = now(),
      status = CASE WHEN jsonb_array_length(conflicts) > 0 THEN 'conflict' ELSE 'connected' END,
      last_error = CASE
        WHEN jsonb_array_length(conflicts) > 0
          THEN format('%s OTA event(s) overlap existing bookings on this room.', jsonb_array_length(conflicts))
        ELSE NULL
      END
  WHERE id = conn.id;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'unchanged', unchanged_count,
    'cancelled', cancelled_count,
    'conflicts', conflicts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_ota_ical_blocks(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_ota_ical_blocks(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_ota_ical_blocks(uuid, jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. get_ota_ical_export: room-type connections export fully booked date ranges
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ota_ical_export(export_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  conn record;
  local_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  room_events jsonb;
BEGIN
  IF export_token IS NULL OR export_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.hotel_id, c.room_id, c.room_type_id, h.name AS hotel_name, r.room_number, rt.name AS room_type_name
  INTO conn
  FROM public.ota_connections c
  JOIN public.hotels h ON h.id = c.hotel_id
  LEFT JOIN public.rooms r ON r.id = c.room_id
  LEFT JOIN public.room_types rt ON rt.id = c.room_type_id
  WHERE c.ical_export_token = export_token
    AND c.status <> 'disconnected';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF conn.room_type_id IS NOT NULL THEN
    WITH type_rooms AS (
      SELECT r.id
      FROM public.rooms r
      WHERE r.room_type_id = conn.room_type_id
        AND r.hotel_id = conn.hotel_id
        AND r.status IS DISTINCT FROM 'maintenance'
    ),
    days AS (
      SELECT generate_series(local_today, local_today + 365, interval '1 day')::date AS day
    ),
    full_days AS (
      SELECT days.day
      FROM days
      JOIN public.bookings b
        ON b.room_id IN (SELECT id FROM type_rooms)
       AND b.check_in <= days.day
       AND b.check_out > days.day
       AND (
         b.status IN ('confirmed', 'checked_in')
         OR (
           b.status IN ('held', 'pending_payment', 'pending_verification')
           AND (b.expires_at IS NULL OR b.expires_at >= now())
         )
       )
      GROUP BY days.day
      HAVING count(DISTINCT b.room_id) >= (SELECT count(*) FROM type_rooms)
    ),
    runs AS (
      SELECT day, day - (row_number() OVER (ORDER BY day))::integer AS run_key
      FROM full_days
    ),
    ranges AS (
      SELECT min(day) AS start_day, max(day) + 1 AS end_day
      FROM runs
      GROUP BY run_key
    )
    SELECT jsonb_agg(
      jsonb_build_object('uid', conn.id::text || '-' || to_char(start_day, 'YYYYMMDD'), 'start', start_day, 'end', end_day)
      ORDER BY start_day
    )
    INTO room_events
    FROM ranges;

    RETURN jsonb_build_object(
      'calendarName', conn.hotel_name || ' · ' || conn.room_type_name,
      'events', coalesce(room_events, '[]'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'calendarName', conn.hotel_name || coalesce(' · ' || conn.room_number, ''),
    'events', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('uid', b.id, 'start', b.check_in, 'end', b.check_out)
        ORDER BY b.check_in
      )
      FROM public.bookings b
      WHERE conn.room_id IS NOT NULL
        AND b.room_id = conn.room_id
        AND b.check_out >= local_today
        AND b.check_in <= local_today + 730
        AND b.ota_connection_id IS DISTINCT FROM conn.id
        AND (
          b.status IN ('confirmed', 'checked_in')
          OR (
            b.status IN ('held', 'pending_payment', 'pending_verification')
            AND (b.expires_at IS NULL OR b.expires_at >= now())
          )
        )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ota_ical_export(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ota_ical_export(text) TO anon, authenticated, service_role;
