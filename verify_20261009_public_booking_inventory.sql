-- Read-only verification for 20261009_public_booking_inventory.sql.
-- Every row should return PASS. This script does not expose hotel, room, or booking rows.

SELECT
  'inventory RPC is a fixed-search-path SECURITY DEFINER with RLS disabled' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.get_public_room_type_availability(uuid,date,date)'::regprocedure
        AND p.prosecdef
        AND p.prorettype = 'record'::regtype
        AND p.proconfig @> ARRAY['search_path=public, pg_temp']
        AND p.proconfig @> ARRAY['row_security=off']
    ) THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'inventory RPC filters to published hotels and counts only occupying bookings',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.get_public_room_type_availability(uuid,date,date)'::regprocedure
        AND p.prosrc LIKE '%public_enabled%'
        AND p.prosrc LIKE '%maintenance%'
        AND p.prosrc LIKE '%checked_in%'
        AND p.prosrc LIKE '%pending_verification%'
        AND p.prosrc LIKE '%expires_at%'
        AND p.prosrc LIKE '%target_check_in%'
        AND p.prosrc LIKE '%target_check_out%'
        AND p.prosrc NOT LIKE '%guest_name%'
        AND p.prosrc NOT LIKE '%guest_email%'
        AND p.prosrc NOT LIKE '%phone%'
    ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'inventory RPC is executable by anon and authenticated without PUBLIC grant',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.get_public_room_type_availability(uuid,date,date)'::regprocedure
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) grant_entry
          WHERE grant_entry.grantee = 0
            AND grant_entry.privilege_type = 'EXECUTE'
        )
    ) THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
