-- Verify migration: 20260904_add_hotel_payment_settings.sql
-- Run after applying the migration. Every row should show PASS.

SELECT 'hotel_payment_settings table exists' AS check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hotel_payment_settings'
  ) THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT 'hotel_id unique constraint exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'hotel_payment_settings'
      AND constraint_name = 'hotel_payment_settings_hotel_id_unique'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT 'RLS enabled',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'hotel_payment_settings' AND rowsecurity = true
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT 'slipok_key_enc column nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hotel_payment_settings'
      AND column_name = 'slipok_key_enc'
      AND is_nullable = 'YES'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT 'slipok_enabled has default true',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hotel_payment_settings'
      AND column_name = 'slipok_enabled'
      AND column_default = 'true'
  ) THEN 'PASS' ELSE 'FAIL' END;

SELECT 'select policy uses hotel membership gate',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_payment_settings'
      AND policyname = 'hotel_payment_settings_select'
      AND qual LIKE '%is_hotel_member%'
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT 'write policies use hotel membership gate',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_payment_settings'
      AND policyname = 'hotel_payment_settings_upsert'
      AND with_check LIKE '%is_hotel_member%'
  ) AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_payment_settings'
      AND policyname = 'hotel_payment_settings_update'
      AND qual LIKE '%is_hotel_member%'
      AND with_check LIKE '%is_hotel_member%'
  ) THEN 'PASS' ELSE 'FAIL' END;
