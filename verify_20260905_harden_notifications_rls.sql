-- Phase 10 verification for notification RLS hardening.
-- Every result must be PASS.

SELECT 'no broad notification policy' AS check,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND (qual = 'true' OR with_check = 'true')
  ) THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'member select policy exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_select_member'
      AND qual LIKE '%hotel_users%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'member update policy exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_mark_read_member'
      AND qual LIKE '%hotel_users%'
      AND with_check LIKE '%hotel_users%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'immutable content trigger exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.notifications'::regclass
      AND tgname = 'notifications_content_immutable'
      AND tgenabled <> 'D'
  ) THEN 'PASS' ELSE 'FAIL' END;
