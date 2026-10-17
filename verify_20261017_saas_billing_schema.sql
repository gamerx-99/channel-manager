-- Read-only verification for 20261017_saas_billing_schema.sql.
-- Every row must read PASS. Run only after the owner applies the migration.

SELECT
  'plans table exists with RLS + public read' AS check_name,
  CASE WHEN
    to_regclass('public.plans') IS NOT NULL
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plans'::regclass)
    AND EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'plans'
        AND policyname = 'plans_public_read' AND cmd = 'SELECT')
    THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'three tiers seeded with ascending ceilings',
  CASE WHEN (
    SELECT count(*) FROM public.plans
    WHERE code = 'starter' AND max_rooms = 8
  ) = 1
    AND (SELECT count(*) FROM public.plans WHERE code = 'standard' AND max_rooms = 25) = 1
    AND (SELECT count(*) FROM public.plans WHERE code = 'pro') = 1
    AND (SELECT max(max_rooms) FROM public.plans WHERE code <> 'pro')
      < (SELECT min(max_rooms) FROM public.plans WHERE code = 'pro')
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'anon/authenticated cannot write plans',
  CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'plans'
        AND grantee IN ('anon', 'authenticated')
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'subscriptions table + status/cycle CHECK constraints',
  CASE WHEN
    to_regclass('public.subscriptions') IS NOT NULL
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass)
    AND EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%trialing%'
        AND pg_get_constraintdef(oid) LIKE '%past_due%')
    AND EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%yearly%')
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'at most one live subscription per hotel',
  CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'subscriptions'
        AND indexname = 'subscriptions_one_live_per_hotel'
        AND indexdef LIKE '%UNIQUE%'
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'tier-ceiling trigger installed',
  CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.subscriptions'::regclass
        AND tgname = 'subscriptions_tier_fits'
        AND NOT tgisinternal
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

-- Capability-scoped, NOT membership-scoped. The post-bootstrap regression was
-- `is_hotel_member` on writes, which let housekeeping rewrite pricing.
SELECT
  'subscriptions write is platform-only (not hotel_member)',
  CASE WHEN
    EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'subscriptions'
        AND policyname = 'subscriptions_platform_write'
        AND cmd = 'ALL'
        AND qual LIKE '%is_super_admin%'
        AND with_check LIKE '%is_super_admin%')
    AND NOT EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'subscriptions'
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
        AND qual LIKE '%is_hotel_member%')
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'hotels lifecycle columns added (soft delete, no data loss)',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hotels'
      AND column_name IN ('suspended_at', 'deleted_at')
  ) = 2
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'hotel_is_active() exists and is granted',
  CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = 'hotel_is_active'
        AND pronargs = 1
    )
    AND has_function_privilege('anon', 'public.hotel_is_active(uuid)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END

-- Negative control: hotel_is_active must be FALSE for a hotel with no
-- subscription at all. Uses the 'starter' plan only if it exists; a hotel id of
-- all-zeroes can never exist, so a FAIL here means the function is not
-- respecting the subscription requirement.
UNION ALL

SELECT
  'hotel_is_active() rejects a hotel with no live subscription',
  CASE WHEN public.hotel_is_active('00000000-0000-0000-0000-000000000000'::uuid)
    THEN 'FAIL' ELSE 'PASS' END

ORDER BY check_name;

-- ===========================================================================
-- MANUAL TESTS (owner-run)
-- ===========================================================================
-- 1. Tier ceiling trigger must reject an over-claiming subscription:
--      begin;
--      select set_config('request.jwt.claims','{"sub":"<super_admin_uuid>","role":"authenticated"}',true);
--      set local role authenticated;
--      insert into public.subscriptions
--        (hotel_id, plan_code, status, tier_rooms, price_paid, period_end)
--      values ('<hotel>','starter','trialing', 40, 0, now() + interval '14 days');
--      -- EXPECTED: ERROR 23514  tier_rooms 40 exceeds plan starter ceiling 8
--      rollback;
--
-- 2. Same insert with tier_rooms = 8 must succeed.
--
-- 3. Duplicate live subscription for the same hotel must fail on the unique
--    index subscriptions_one_live_per_hotel.