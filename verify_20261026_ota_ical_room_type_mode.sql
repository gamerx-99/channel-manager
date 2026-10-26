-- Read-only verification for 20261026_ota_ical_room_type_mode.sql.
-- Every row should return PASS. This script does not expose hotel, room, or booking rows.

SELECT
  'ota_connections.room_type_id exists and references room_types' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ota_connections'::regclass AND contype = 'f'
      AND confrelid = 'public.room_types'::regclass
  ) THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'a connection maps to at most one of room_id / room_type_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ota_connections'::regclass
      AND conname = 'ota_connections_single_target'
      AND pg_get_constraintdef(oid) LIKE '%num_nonnulls%'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.ota_connections WHERE room_id IS NOT NULL AND room_type_id IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'hotel consistency trigger covers room_type_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.ota_connection_room_same_hotel()'::regprocedure
      AND p.prosrc LIKE '%room_type_id%'
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ota_connections'::regclass
      AND tgname = 'trg_ota_connection_room_same_hotel'
      AND NOT tgisinternal
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'sync RPC places room-type events on free rooms and still guards authorization',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.sync_ota_ical_blocks(uuid,jsonb)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['row_security=off']
      AND p.prosrc LIKE '%room_type_id%'
      AND p.prosrc LIKE '%FOREACH candidate IN ARRAY candidates%'
      AND p.prosrc LIKE '%exclusion_violation%'
      AND p.prosrc LIKE '%can_manage_ical%'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'export RPC closes room-type dates only when every room is occupied, with no guest data',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.get_ota_ical_export(text)'::regprocedure
      AND p.prosecdef
      AND p.prosrc LIKE '%HAVING count(DISTINCT b.room_id) >= (SELECT count(*) FROM type_rooms)%'
      AND p.prosrc LIKE '%IS DISTINCT FROM conn.id%'
      AND p.prosrc NOT LIKE '%guest_name%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'export RPC still returns NULL for an unknown token',
  CASE WHEN public.get_ota_ical_export(repeat('0', 64)) IS NULL THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
