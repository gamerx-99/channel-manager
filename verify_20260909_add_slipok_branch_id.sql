-- Verify: 20260909_add_slipok_branch_id.sql
-- Run after the migration in the Supabase SQL editor. Every row should read PASS.

SELECT
  'hotel_payment_settings.slipok_branch_id exists' AS check_name,
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hotel_payment_settings'
  AND column_name = 'slipok_branch_id'

UNION ALL

SELECT
  'hotel_payment_settings.slipok_branch_id is nullable text',
  CASE WHEN data_type = 'text' AND is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hotel_payment_settings'
  AND column_name = 'slipok_branch_id'

ORDER BY check_name;
