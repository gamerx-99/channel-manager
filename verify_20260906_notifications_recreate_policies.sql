-- verify_20260906_notifications_recreate_policies.sql
-- Verify the Phase 10 notifications final state. Every row must read PASS.
-- Run after 20260906_notifications_recreate_policies.sql.

SELECT 'notifications table exists' AS check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'RLS enabled on notifications',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notifications' AND rowsecurity
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'no policy references public.users',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND (qual LIKE '%public.users%' OR with_check LIKE '%public.users%')
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'no broad true policy',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND (btrim(qual, '() ') = 'true' OR btrim(with_check, '() ') = 'true')
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'no INSERT or DELETE policy for clients',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND cmd IN ('INSERT', 'DELETE')
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'member select policy scopes via is_hotel_member',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_select_member'
      AND cmd = 'SELECT'
      AND roles = '{authenticated}'
      AND qual LIKE '%is_hotel_member%'
      AND qual NOT LIKE '%public.users%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'member update policy scopes via is_hotel_member',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_mark_read_member'
      AND cmd = 'UPDATE'
      AND roles = '{authenticated}'
      AND qual LIKE '%is_hotel_member%'
      AND with_check LIKE '%is_hotel_member%'
      AND qual NOT LIKE '%public.users%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'immutable content trigger active',
  CASE WHEN to_regclass('public.notifications') IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.notifications')
      AND tgname = 'notifications_content_immutable'
      AND tgenabled <> 'D'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'hotel_id index exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_hotel_id_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;
