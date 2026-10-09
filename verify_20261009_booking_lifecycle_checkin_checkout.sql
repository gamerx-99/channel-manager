-- Read-only verification for 20261009_booking_lifecycle_checkin_checkout.sql.
-- Every row should return PASS.

SELECT
  'transition function enforces authenticated hotel permission and both lifecycle edges' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.transition_booking_status(uuid,uuid,text)'::regprocedure
        AND p.prosecdef
        AND p.prosrc LIKE '%auth.uid()%'
        AND p.prosrc LIKE '%hotel_owner%'
        AND p.prosrc LIKE '%front_desk%'
        AND p.prosrc LIKE '%confirmed%checked_in%'
        AND p.prosrc LIKE '%checked_in%checked_out%'
        AND p.prosrc LIKE '%booking_status_log%'
        AND p.prosrc LIKE '%FOR UPDATE%'
        AND p.proconfig @> ARRAY['search_path=public, pg_temp']
        AND p.proconfig @> ARRAY['row_security=off']
    ) THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'transition function is executable by authenticated only',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.transition_booking_status(uuid,uuid,text)'::regprocedure
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) grant_entry
          WHERE grant_entry.grantee = 0
            AND grant_entry.privilege_type = 'EXECUTE'
        )
    ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'existing booking status log table is present',
  CASE WHEN to_regclass('public.booking_status_log') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
