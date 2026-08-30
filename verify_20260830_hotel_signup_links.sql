-- =====================================================================
-- Post-apply verification for 20260830_add_hotel_signup_links.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) The table exists with the expected columns.
select
  'table_exists' as check_name,
  case when count(*) = 8 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'hotel_signup_links'
  and column_name in ('id','hotel_id','token','created_by','expires_at','used_at','used_by_user_id','created_at');

-- 2) RLS is enabled.
select
  'rls_enabled' as check_name,
  case when relrowsecurity then 'PASS' else 'FAIL' end as verdict,
  'relrowsecurity=' || relrowsecurity as detail
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'hotel_signup_links';

-- 3) token has a unique constraint.
select
  'token_unique' as check_name,
  case when count(*) > 0 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname, ', ') as detail
from pg_constraint
where conrelid = 'public.hotel_signup_links'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like '%token%';

-- 4) THE LOAD-BEARING CHECK: no policy grants anon/authenticated any access.
--    If this returns any row, the "server-only via service role" claim is false.
select
  'no_anon_authenticated_policy' as check_name,
  'FAIL' as verdict,
  policyname || ' (' || cmd || ') roles=' || array_to_string(roles, ',') as detail
from pg_policies
where schemaname = 'public' and tablename = 'hotel_signup_links';
-- ^ Zero rows = PASS.
