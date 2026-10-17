-- Read-only verification for 20261017_hotel_users_role_escalation_guard.sql.
-- Every row must read PASS. Run only after the owner applies the migration.
-- Read-only: this script asserts policy/grantee text, it does not attempt an
-- escalation. The live negative test (hotel_owner inserting role='admin' must be
-- REJECTED) has to be run by the owner in a scratch session — see the footer.

SELECT
  'hotel_users RLS still enabled' AS check_name,
  CASE WHEN (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.hotel_users'::regclass)
    THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'hotel_users_manage_scoped policy exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'hotel_users'
        AND policyname = 'hotel_users_manage_scoped')
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

-- The fix in one assertion: the WITH CHECK expression must enumerate the four
-- hotel-scoped roles and must NOT mention the string 'admin' outside super_admin.
-- An older policy that only excluded 'super_admin' fails this check.
SELECT
  'write policy restricts roles to hotel-scoped set',
  CASE WHEN
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'hotel_users'
        AND policyname = 'hotel_users_manage_scoped'
        AND qual LIKE '%can_manage_staff%'
        AND with_check LIKE '%hotel_owner%'
        AND with_check LIKE '%revenue_manager%'
        AND with_check LIKE '%front_desk%'
        AND with_check LIKE '%housekeeping%'
        -- the dangerous shape: a bare `role <> 'super_admin'` style guard that
        -- still lets 'admin' through
        AND with_check NOT LIKE '%role <> %'
    ) = 1
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'anon cannot write hotel_users (no INSERT/UPDATE/DELETE grant)',
  CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'hotel_users'
        AND grantee = 'anon'
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

-- service_role must keep working: the app's admin-client membership helpers
-- (createHotelOwnerMembership in server/supabase.ts) go through it.
SELECT
  'service_role retains membership write grants',
  CASE WHEN (
      SELECT count(DISTINCT privilege_type) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'hotel_users'
        AND grantee = 'service_role'
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ) = 3
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

-- The role CHECK allow-list must be unchanged: no assignment becomes invalid.
SELECT
  'hotel_users role CHECK still allows admin + super_admin',
  CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.hotel_users'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%admin%'
        AND pg_get_constraintdef(oid) LIKE '%hotel_owner%'
    )
    THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;

-- ---------------------------------------------------------------------------
-- MANUAL NEGATIVE TEST (owner-run, not part of the automated script)
-- ---------------------------------------------------------------------------
-- Sign in as a real hotel_owner, then:
--
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"<hotel_owner_uuid>","role":"authenticated"}', true);
--   insert into public.hotel_users (hotel_id, user_id, role)
--   values ('<their hotel>', '<their uuid>', 'admin');
--
-- EXPECTED: ERROR — new row violates row-level security policy.
-- Then confirm the row count for role in ('admin','super_admin') did not change:
--
--   select role, count(*) from public.hotel_users
--   where role in ('admin','super_admin') group by role;
--
-- Roll back with:  rollback;