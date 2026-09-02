-- Booking Lifecycle v1, Sub-phase D: Verify hotel_services catalog migration
-- Run after 20260911_add_hotel_services_catalog.sql in Supabase SQL editor.
-- Every row should return PASS.

SELECT
  'hotel_services table exists' AS check_name,
  CASE WHEN to_regclass('public.hotel_services') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'hotel_services has required columns',
  CASE WHEN COUNT(*) = 7 THEN 'PASS' ELSE 'FAIL — got ' || COUNT(*) || ' columns' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hotel_services'
  AND column_name IN ('id','hotel_id','name','pricing_model','unit_price','is_active','created_at')

UNION ALL

SELECT
  'hotel_services RLS enabled',
  CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'hotel_services'

UNION ALL

SELECT
  'hotel_services has manage + public_select policies',
  CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL — got ' || COUNT(*) END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hotel_services'

UNION ALL

SELECT
  'hotel_services index on hotel_id exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'hotel_services' AND indexname = 'idx_hotel_services_hotel_id'

UNION ALL

SELECT
  'hotel_services pricing_model check constraint accepts the 3 models',
  CASE WHEN pg_get_constraintdef(oid) LIKE '%PER_PERSON_PER_NIGHT%'
        AND pg_get_constraintdef(oid) LIKE '%PER_NIGHT%'
        AND pg_get_constraintdef(oid) LIKE '%ONE_TIME%'
       THEN 'PASS' ELSE 'FAIL' END
FROM pg_constraint
WHERE conrelid = 'public.hotel_services'::regclass AND contype = 'c' AND conname LIKE '%pricing_model%'

ORDER BY check_name;
