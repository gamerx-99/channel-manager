-- PHASE10_INSPECT_DATABASE_STATE.sql
-- STEP 0 — READ-ONLY database state inspection. Run this BEFORE applying anything.
-- This script makes no changes. Paste the full output back into the ticket.
-- It answers, for the live project:
--   1. Does public.notifications exist, and with which columns?
--   2. Which RLS policies exist on notifications (and hotel_payment_settings)?
--   3. Does any policy still reference public.users (a table that does not exist here)?
--   4. Do the helper gatekeeper functions exist?
--   5. Does the immutable-content trigger exist?

-- Section 1: summary checks ------------------------------------------------
SELECT 'notifications table exists' AS check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN 'YES' ELSE 'NO' END AS result
UNION ALL
SELECT 'notifications RLS enabled',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notifications' AND rowsecurity
  ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'notifications policy count',
  (SELECT count(*)::text FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'notifications')
UNION ALL
SELECT 'notifications policy names',
  coalesce((SELECT string_agg(policyname, ', ' ORDER BY policyname) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'notifications'), '(none)')
UNION ALL
SELECT 'broad true policy on notifications (must be NO)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND (btrim(qual, '() ') = 'true' OR btrim(with_check, '() ') = 'true')
  ) THEN 'YES - PROBLEM' ELSE 'NO' END
UNION ALL
SELECT 'any policy referencing public.users anywhere (must be NO)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE qual LIKE '%public.users%' OR with_check LIKE '%public.users%'
  ) THEN 'YES - PROBLEM' ELSE 'NO' END
UNION ALL
SELECT 'notifications immutable-content trigger exists',
  CASE WHEN to_regclass('public.notifications') IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.notifications')
      AND tgname = 'notifications_content_immutable'
      AND tgenabled <> 'D'
  ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'hotel_payment_settings table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hotel_payment_settings'
  ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'hotel_payment_settings RLS enabled',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'hotel_payment_settings' AND rowsecurity
  ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'hotel_payment_settings policy names',
  coalesce((SELECT string_agg(policyname, ', ' ORDER BY policyname) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hotel_payment_settings'), '(none)')
UNION ALL
SELECT 'gatekeeper functions present (expect 3)',
  (SELECT count(*)::text FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('is_super_admin', 'is_hotel_member', 'is_platform_admin'));

-- Section 2: full policy detail (expressions included) ----------------------
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications', 'hotel_payment_settings')
ORDER BY tablename, policyname;
