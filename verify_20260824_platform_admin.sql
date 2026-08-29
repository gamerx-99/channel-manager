-- =====================================================================
-- Post-apply verification for 20260824_add_admin_role_and_platform_admin.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) The role CHECK constraint accepts exactly the six human roles.
select
  'role_check_allows_admin' as check_name,
  case when pg_get_constraintdef(oid) like '%''admin''%' then 'PASS' else 'FAIL' end as verdict,
  pg_get_constraintdef(oid) as detail
from pg_constraint
where conrelid = 'public.hotel_users'::regclass
  and conname = 'hotel_users_role_check';

-- 2) is_platform_admin() exists, is SECURITY DEFINER, and covers both platform roles.
select
  'is_platform_admin_definition' as check_name,
  case
    when p.prosecdef
     and pg_get_functiondef(p.oid) like '%''super_admin'', ''admin''%'
     and pg_get_functiondef(p.oid) like '%row_security%off%'
    then 'PASS' else 'FAIL'
  end as verdict,
  pg_get_functiondef(p.oid) as detail
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_platform_admin';

-- 3) is_hotel_member() now short-circuits on is_platform_admin().
select
  'is_hotel_member_uses_platform_admin' as check_name,
  case when pg_get_functiondef(p.oid) like '%is_platform_admin()%' then 'PASS' else 'FAIL' end as verdict,
  pg_get_functiondef(p.oid) as detail
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_hotel_member';

-- 4) is_super_admin() was NOT widened. This is what keeps createHotel,
--    Admin Users, and the hotel_users write policies closed to `admin`.
select
  'is_super_admin_unchanged' as check_name,
  case when pg_get_functiondef(p.oid) not like '%''admin''%' then 'PASS' else 'FAIL' end as verdict,
  pg_get_functiondef(p.oid) as detail
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_super_admin';

-- 5) THE LOAD-BEARING CHECK: no surviving write policy routes through
--    is_hotel_member(). If this returns any row, `admin` can write to every
--    hotel at the database layer and the read-only claim is false.
select
  'no_write_policy_on_is_hotel_member' as check_name,
  'FAIL' as verdict,
  schemaname || '.' || tablename || ' / ' || policyname || ' (' || cmd || ')' as detail
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and (coalesce(qual, '') like '%is_hotel_member(%' or coalesce(with_check, '') like '%is_hotel_member(%');
-- ^ Zero rows = PASS.
