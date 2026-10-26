-- =====================================================================
-- Verify: 20261027_room_type_occupancy_fixes.sql
-- Run after 20261027_room_type_occupancy_fixes.sql in the Supabase SQL editor.
-- Every result row must report PASS. This script is read-only.
-- =====================================================================

SELECT 'update_room_type_rpc_installed' AS check_name,
  CASE WHEN to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'update_room_type_scoped_to_target_room_type',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)')
      AND p.prosrc LIKE '%WHERE rt.id = target_room_type_id AND rt.hotel_id = target_hotel_id%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'update_room_type_rpc_grants',
  CASE WHEN has_function_privilege('authenticated', 'public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.update_room_type_with_occupancy_config(uuid,uuid,text,integer,numeric,jsonb)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'get_public_availability_rpc_installed',
  CASE WHEN to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'get_public_availability_height_boundary_strictly_below',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)')
      AND p.prosrc LIKE '%< rt.child_rule_limit%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'get_public_availability_rpc_grants',
  CASE WHEN has_function_privilege('anon', 'public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
