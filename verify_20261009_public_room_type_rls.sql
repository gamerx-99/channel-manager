-- Read-only verification for 20261009_public_room_type_rls.sql.
-- Every row should return PASS. This script does not inspect or expose hotel data.

SELECT
  'public room type policy uses published hotel predicate' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'room_types'
        AND policyname = 'room_types_public_select'
        AND cmd = 'SELECT'
        AND qual LIKE '%is_published_hotel%'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result

UNION ALL

SELECT
  'published hotel predicate checks public_enabled',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.is_published_hotel(uuid)'::regprocedure
        AND p.prosecdef
        AND p.prosrc LIKE '%public_enabled%'
        AND 'row_security=off' = ANY(p.proconfig)
    )
      THEN 'PASS'
    ELSE 'FAIL'
  END

UNION ALL

SELECT
  'predicate execution granted only to anon and authenticated roles',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.is_published_hotel(uuid)'::regprocedure
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) grant_entry
          WHERE grant_entry.grantee = 0
            AND grant_entry.privilege_type = 'EXECUTE'
        )
    )
      THEN 'PASS'
    ELSE 'FAIL'
  END

ORDER BY check_name;
