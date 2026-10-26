-- =====================================================================
-- Verify: 20261027_rls_write_hardening.sql
-- Run after 20261027_rls_write_hardening.sql in the Supabase SQL editor.
-- Every row of the first result must report PASS. This script is read-only.
-- =====================================================================

WITH p AS (
  SELECT tablename, policyname, cmd, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT 'hotel_users_staff_cannot_write_platform_roles' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM p WHERE tablename = 'hotel_users' AND policyname = 'hotel_users_manage_scoped'
      AND with_check LIKE '%admin%' AND with_check LIKE '%support%'
      AND qual LIKE '%admin%' AND qual LIKE '%support%'
  ) THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'payment_settings_writes_owner_only',
  CASE WHEN (SELECT count(*) FROM p WHERE tablename = 'hotel_payment_settings' AND cmd IN ('INSERT', 'UPDATE')
               AND (qual || with_check) LIKE '%can_manage_property%' AND (qual || with_check) NOT LIKE '%is_hotel_member%') = 2
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'payment_sessions_writes_booking_managers',
  CASE WHEN (SELECT count(*) FROM p WHERE tablename = 'payment_sessions' AND cmd IN ('INSERT', 'UPDATE')
               AND (qual || with_check) LIKE '%can_manage_bookings%' AND (qual || with_check) NOT LIKE '%is_hotel_member%') = 2
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
-- No write policy on these tables may still rest on plain membership.
SELECT 'no_member_only_write_policies_left',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM p
    WHERE tablename IN ('hotel_payment_settings', 'payment_sessions', 'booking_services', 'rate_overrides',
                        'housekeeping_tasks', 'message_threads', 'messages', 'hotel_services')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (qual || with_check) LIKE '%is_hotel_member%'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'old_all_policies_removed',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM p WHERE policyname IN (
      'Users can view and manage services for bookings in their hotels', 'rate_overrides_manage',
      'housekeeping_tasks_manage', 'message_threads_manage', 'messages_manage', 'hotel_services_manage')
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'members_still_read_their_data',
  CASE WHEN (SELECT count(*) FROM p WHERE cmd = 'SELECT' AND policyname IN (
      'booking_services_select', 'rate_overrides_select', 'housekeeping_tasks_select',
      'message_threads_select', 'messages_select', 'hotel_services_member_select',
      'hotel_payment_settings_select', 'payment_sessions_select')) = 8
    THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'write_policy_count',
  CASE WHEN (SELECT count(*) FROM p WHERE policyname IN (
      'booking_services_insert', 'booking_services_update', 'booking_services_delete',
      'rate_overrides_insert', 'rate_overrides_update', 'rate_overrides_delete',
      'housekeeping_tasks_insert', 'housekeeping_tasks_update', 'housekeeping_tasks_delete',
      'message_threads_insert', 'message_threads_update', 'message_threads_delete',
      'messages_insert', 'messages_update', 'messages_delete',
      'hotel_services_insert', 'hotel_services_update', 'hotel_services_delete')) = 18
    THEN 'PASS' ELSE 'FAIL' END;

-- Information only (not PASS/FAIL): every platform-role account. Anything you do
-- not recognise here was created before this fix and should be removed by hand.
SELECT hu.role, u.email, h.name AS anchor_hotel, hu.created_at
FROM public.hotel_users hu
JOIN auth.users u ON u.id = hu.user_id
JOIN public.hotels h ON h.id = hu.hotel_id
WHERE hu.role IN ('super_admin', 'admin')
ORDER BY hu.role, hu.created_at;
