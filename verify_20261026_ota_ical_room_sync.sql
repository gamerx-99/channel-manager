-- Read-only verification for 20261026_ota_ical_room_sync.sql.
-- Every row should return PASS. This script does not expose hotel, room, or booking rows.

SELECT
  'ota_connections has room_id, ical_* columns, last_error and a NOT NULL export token' AS check_name,
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ota_connections'
      AND column_name IN ('room_id', 'ical_import_url', 'ical_export_url', 'ical_export_token', 'last_error')
  ) = 5
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ota_connections'
      AND column_name = 'ical_export_token' AND is_nullable = 'NO' AND column_default IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'every connection has a unique 64-hex export token',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.ota_connections WHERE ical_export_token !~ '^[0-9a-f]{64}$'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_ota_connections_export_token'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'ota_connections status is constrained to the sync vocabulary',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ota_connections'::regclass
      AND conname = 'ota_connections_status_check'
      AND pg_get_constraintdef(oid) LIKE '%conflict%'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'room/hotel consistency trigger is installed',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ota_connections'::regclass
      AND tgname = 'trg_ota_connection_room_same_hotel'
      AND NOT tgisinternal
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'bookings.source allows ota_ical and exactly one source check exists',
  CASE WHEN (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
      AND conname <> 'bookings_ota_block_shape'
  ) = 1
  AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'bookings_source_check'
      AND pg_get_constraintdef(oid) LIKE '%ota_ical%'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'bookings has ota_connection_id (cascade), external_uid and a unique per-connection UID index',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass AND contype = 'f'
      AND confrelid = 'public.ota_connections'::regclass
      AND confdeltype = 'c'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'external_uid'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_bookings_ota_external_uid'
      AND indexdef ILIKE '%unique%'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'double-booking exclusion constraint still covers confirmed bookings',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'prevent_double_booking'
      AND contype = 'x'
      AND pg_get_constraintdef(oid) LIKE '%confirmed%'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'sync RPC is SECURITY DEFINER, authorizes, catches overlaps, and is not executable by anon',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.sync_ota_ical_blocks(uuid,jsonb)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
      AND p.proconfig @> ARRAY['row_security=off']
      AND p.prosrc LIKE '%can_manage_ical%'
      AND p.prosrc LIKE '%service_role%'
      AND p.prosrc LIKE '%exclusion_violation%'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'export RPC is SECURITY DEFINER, token-gated, excludes own blocks, exposes no guest data',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.get_ota_ical_export(text)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['row_security=off']
      AND p.prosrc LIKE '%ical_export_token%'
      AND p.prosrc LIKE '%IS DISTINCT FROM conn.id%'
      AND p.prosrc NOT LIKE '%guest_name%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'export RPC returns NULL for an unknown token',
  CASE WHEN public.get_ota_ical_export(repeat('0', 64)) IS NULL THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
