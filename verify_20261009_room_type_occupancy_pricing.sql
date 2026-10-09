-- Run after 20261009_room_type_occupancy_pricing.sql in the Supabase SQL editor.
-- Every result row must report PASS. This script is read-only.
SELECT 'room_type_pricing_columns' AS check_name,
  CASE WHEN COUNT(*) = 7 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types'
  AND column_name IN (
    'base_occupancy', 'max_occupancy', 'occupancy_pricing', 'child_rule',
    'child_rule_limit', 'child_rates', 'children_count_toward_max'
  )
UNION ALL
SELECT 'pricing_defaults',
  CASE WHEN COUNT(*) = 6 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types'
  AND ((column_name = 'base_occupancy' AND column_default LIKE '%2%')
    OR (column_name = 'max_occupancy' AND column_default LIKE '%2%')
    OR (column_name = 'occupancy_pricing' AND column_default LIKE '%{}%')
    OR (column_name = 'child_rule' AND column_default LIKE '%age%')
    OR (column_name = 'child_rates' AND column_default IS NOT NULL)
    OR (column_name = 'children_count_toward_max' AND column_default LIKE '%true%'))
UNION ALL
SELECT 'height_limit_requires_owner_configuration',
  CASE WHEN is_nullable = 'YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'room_types' AND column_name = 'child_rule_limit'
UNION ALL
SELECT 'occupancy_pricing_constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.room_types'::regclass AND conname = 'room_types_occupancy_values_check'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'all_guest_levels_have_explicit_configuration',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.room_types rt
    WHERE jsonb_typeof(rt.occupancy_pricing) IS DISTINCT FROM 'object'
      OR (SELECT COUNT(*) FROM jsonb_object_keys(rt.occupancy_pricing)) <> rt.max_occupancy
      OR EXISTS (
        SELECT 1 FROM generate_series(1, rt.max_occupancy) AS levels(guest_count)
        WHERE NOT (rt.occupancy_pricing ? levels.guest_count::text)
      )
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'base_occupancy_uses_normal_rate',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.room_types rt
    WHERE COALESCE((rt.occupancy_pricing->rt.base_occupancy::text->>'enabled')::boolean, false) IS DISTINCT FROM true
      OR COALESCE(rt.occupancy_pricing->rt.base_occupancy::text->>'mode', '') <> 'percent'
      OR COALESCE((rt.occupancy_pricing->rt.base_occupancy::text->>'value')::numeric, -1) <> 0
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'shared_child_measurement_rule',
  CASE WHEN COUNT(DISTINCT child_rule) <= 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.room_types
UNION ALL
SELECT 'public_guest_availability_rpc',
  CASE WHEN to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'public_rpc_filters_published_capacity_and_off_levels',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)')
      AND p.prosrc LIKE '%h.public_enabled = true%'
      AND p.prosrc LIKE '%rt.max_occupancy%'
      AND p.prosrc LIKE '%occupancy_pricing%'
      AND p.prosrc LIKE '%child_rates%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'atomic_room_type_occupancy_update_rpc',
  CASE WHEN to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)')
        AND p.prosecdef = false
    )
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'occupancy_update_requires_consistent_schedule',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)')
      AND p.prosrc LIKE '%Base occupancy is required when saving an occupancy pricing schedule.%'
      AND p.prosrc LIKE '%Maximum occupancy must match room capacity.%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'atomic_room_type_occupancy_update_rpc_grants',
  CASE WHEN has_function_privilege('authenticated', 'public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl
      WHERE p.oid = to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)')
        AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )
    THEN 'PASS' ELSE 'FAIL' END
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
