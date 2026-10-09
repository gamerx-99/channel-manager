-- Run after 20261009_room_type_occupancy_pricing.sql in the Supabase SQL editor.
-- Every result row must report PASS.
SELECT 'room_type_occupancy_columns' AS check_name,
  CASE WHEN COUNT(*) = 10 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types'
  AND column_name IN (
    'base_occupancy', 'max_occupancy', 'extra_guest_mode', 'extra_guest_amount',
    'extra_guest_tier_percents', 'child_rule', 'child_rule_limit',
    'child_price_mode', 'child_price_value', 'children_count_toward_max'
  )
UNION ALL
SELECT 'room_type_occupancy_defaults',
  CASE WHEN COUNT(*) = 9 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types'
  AND ((column_name = 'base_occupancy' AND column_default LIKE '%2%')
    OR (column_name = 'max_occupancy' AND column_default LIKE '%2%')
    OR (column_name = 'extra_guest_mode' AND column_default LIKE '%per_person%')
    OR (column_name = 'extra_guest_amount' AND column_default LIKE '%0%')
    OR (column_name = 'extra_guest_tier_percents' AND column_default IS NOT NULL)
    OR (column_name = 'child_rule' AND column_default LIKE '%age%')
    OR (column_name = 'child_price_mode' AND column_default LIKE '%free%')
    OR (column_name = 'child_price_value' AND column_default LIKE '%0%')
    OR (column_name = 'children_count_toward_max' AND column_default LIKE '%true%'))
UNION ALL
SELECT 'child_rule_limit_requires_owner_configuration',
  CASE WHEN is_nullable = 'YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types' AND column_name = 'child_rule_limit'
UNION ALL
SELECT 'existing_capacity_preserved_as_max',
  CASE WHEN COUNT(*) FILTER (WHERE max_occupancy < capacity) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM public.room_types
UNION ALL
SELECT 'shared_child_measurement_rule',
  CASE WHEN COUNT(DISTINCT child_rule) <= 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.room_types
UNION ALL
SELECT 'public_guest_availability_rpc',
  CASE WHEN to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'public_rpc_limits_hotel_to_public_properties',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)')
      AND p.prosrc LIKE '%h.public_enabled = true%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'public_guest_availability_rpc_grants',
  CASE WHEN has_function_privilege('anon', 'public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl
      WHERE p.oid = to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)')
        AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )
    THEN 'PASS' ELSE 'FAIL' END;
