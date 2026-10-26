-- =====================================================================
-- Verify: 20261027_hotel_site_config_public_read.sql
-- Run after 20261027_hotel_site_config_public_read.sql in the Supabase SQL editor.
-- Every result row must report PASS. This script is read-only.
-- =====================================================================

SELECT 'hotel_site_config_table_exists' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hotel_site_config'
  ) THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'hotel_site_config_anon_select_grant',
  CASE WHEN has_table_privilege('anon', 'public.hotel_site_config', 'SELECT')
    AND has_table_privilege('authenticated', 'public.hotel_site_config', 'SELECT')
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_site_config_public_select_policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_site_config'
      AND policyname = 'hotel_site_config_public_select'
      AND cmd = 'SELECT'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_site_config_manage_policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hotel_site_config'
      AND policyname = 'hotel_site_config_manage'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_media_bucket_exists_and_public',
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'hotel-media' AND public = true
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_media_storage_public_read_policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'hotel_media_public_read'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_media_storage_manage_policies',
  CASE WHEN (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN ('hotel_media_manage_insert', 'hotel_media_manage_update', 'hotel_media_manage_delete')
  ) = 3 THEN 'PASS' ELSE 'FAIL' END;
