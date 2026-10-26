-- iCal room sync: OTA calendar events become blocking bookings on one mapped room,
-- and each connection gets a secret .ics export feed of that room's bookings.
-- Additive migration. Run in the Supabase SQL editor, then run
-- verify_20261026_ota_ical_room_sync.sql (every row should read PASS).
--
-- Design (see .agent/DECISIONS.md, 2026-10-26):
-- * One ota_connections row = one physical room. Booking.com and Airbnb iCal feeds are
--   per single unit, so each imported VEVENT occupies exactly that room.
-- * Imported events are stored as bookings with source = 'ota_ical', so the existing
--   prevent_double_booking exclusion constraint, the public inventory RPC, and the
--   dashboard calendar all treat them as occupied without further changes.
-- * The export feed never contains guest names; it lists date ranges only.

-- -----------------------------------------------------------------------------
-- 1. ota_connections: room mapping, export token, last error, status vocabulary
-- -----------------------------------------------------------------------------

-- supabase_migration_production.sql declares ota_connections twice with different
-- columns; make sure the iCal columns exist whichever definition ran first.
ALTER TABLE public.ota_connections
  ADD COLUMN IF NOT EXISTS ical_import_url text,
  ADD COLUMN IF NOT EXISTS ical_export_url text,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ical_export_token text,
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.ota_connections
SET ical_export_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE ical_export_token IS NULL;

ALTER TABLE public.ota_connections
  ALTER COLUMN ical_export_token SET DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  ALTER COLUMN ical_export_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_connections_export_token
  ON public.ota_connections (ical_export_token);

COMMENT ON COLUMN public.ota_connections.room_id IS
  'The single room this OTA calendar blocks and exports. NULL until the owner picks one; sync refuses to run without it.';
COMMENT ON COLUMN public.ota_connections.ical_export_token IS
  'Secret path segment for GET /api/ical/<token>.ics. Anyone holding it can read the room''s booked date ranges (no guest data).';

-- Status vocabulary: active = configured, never synced; connected = last sync OK;
-- conflict = last sync found events overlapping existing bookings; error = last sync failed;
-- disconnected = paused. Legacy free-text values are normalised to 'active'.
UPDATE public.ota_connections
SET status = 'active'
WHERE status NOT IN ('active', 'connected', 'conflict', 'error', 'disconnected');

ALTER TABLE public.ota_connections DROP CONSTRAINT IF EXISTS ota_connections_status_check;
ALTER TABLE public.ota_connections
  ADD CONSTRAINT ota_connections_status_check
  CHECK (status IN ('active', 'connected', 'conflict', 'error', 'disconnected'));

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
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ota_connection_room_same_hotel() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ota_connection_room_same_hotel ON public.ota_connections;
CREATE TRIGGER trg_ota_connection_room_same_hotel
  BEFORE INSERT OR UPDATE OF room_id, hotel_id ON public.ota_connections
  FOR EACH ROW EXECUTE FUNCTION public.ota_connection_room_same_hotel();

-- -----------------------------------------------------------------------------
-- 2. bookings: allow OTA iCal blocks and key them by (connection, VEVENT UID)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  source_constraint record;
BEGIN
  FOR source_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', source_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('manual', 'walk-in', 'phone', 'ota_ical'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ota_connection_id uuid REFERENCES public.ota_connections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS external_uid text;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_ota_block_shape;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_ota_block_shape
  CHECK ((source = 'ota_ical') = (ota_connection_id IS NOT NULL AND external_uid IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_ota_external_uid
  ON public.bookings (ota_connection_id, external_uid)
  WHERE ota_connection_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.ota_connection_id IS
  'Set only for source = ota_ical rows: the OTA calendar that created this block. Deleting the connection removes its blocks.';
COMMENT ON COLUMN public.bookings.external_uid IS
  'VEVENT UID from the OTA feed; with ota_connection_id it makes every sync idempotent.';

-- -----------------------------------------------------------------------------
-- 3. sync_ota_ical_blocks: atomic reconcile of one connection's feed
-- -----------------------------------------------------------------------------
-- events: [{ "uid": text, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "summary": text }]
-- (end is exclusive, i.e. the check-out date). Events that already ended are ignored.
-- An event overlapping another active booking on the same room is NOT inserted; it is
-- returned in "conflicts" so the owner sees the double booking instead of it being hidden.
-- ASSUMPTION: "today" is Asia/Bangkok, matching the UI's display time zone.

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

  IF conn.room_id IS NULL THEN
    RAISE EXCEPTION 'Choose the room this calendar blocks before syncing.' USING ERRCODE = '22023';
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

    BEGIN
      IF NOT has_existing THEN
        INSERT INTO public.bookings (
          hotel_id, room_id, guest_name, check_in, check_out, price, source, status,
          ota_connection_id, external_uid
        ) VALUES (
          conn.hotel_id, conn.room_id, event_label, event_start, event_end, 0, 'ota_ical', 'confirmed',
          conn.id, event_uid
        );
        inserted_count := inserted_count + 1;
      ELSIF existing.status IN ('checked_in', 'checked_out')
        OR (existing.check_in = event_start
          AND existing.check_out = event_end
          AND existing.room_id IS NOT DISTINCT FROM conn.room_id
          AND existing.status = 'confirmed') THEN
        -- Front desk already acted on this stay; the feed never rewrites it.
        unchanged_count := unchanged_count + 1;
      ELSE
        UPDATE public.bookings
        SET check_in = event_start,
            check_out = event_end,
            room_id = conn.room_id,
            guest_name = event_label,
            status = 'confirmed'
        WHERE id = existing.id;
        updated_count := updated_count + 1;
      END IF;
    EXCEPTION WHEN exclusion_violation THEN
      conflicts := conflicts || jsonb_build_object('uid', event_uid, 'start', event_start, 'end', event_end);
    END;
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
-- 4. get_ota_ical_export: token-gated booked date ranges for one room
-- -----------------------------------------------------------------------------
-- Includes every occupying booking on the mapped room (direct bookings and blocks
-- imported from OTHER connections), but never the blocks this connection imported
-- itself, so a feed never echoes an OTA's own reservations back to it.

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
BEGIN
  IF export_token IS NULL OR export_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.room_id, h.name AS hotel_name, r.room_number
  INTO conn
  FROM public.ota_connections c
  JOIN public.hotels h ON h.id = c.hotel_id
  LEFT JOIN public.rooms r ON r.id = c.room_id
  WHERE c.ical_export_token = export_token
    AND c.status <> 'disconnected';

  IF NOT FOUND THEN
    RETURN NULL;
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
