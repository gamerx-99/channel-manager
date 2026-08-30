-- =====================================================================
-- Post-apply verification for 20260831_add_rate_overrides.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) Table exists with the expected columns (7 columns).
select
  'table_columns' as check_name,
  case when count(*) = 7 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'rate_overrides'
  and column_name in ('id','room_type_id','start_date','end_date','override_price','min_stay_nights','created_at');

-- 2) Column types / nullability sanity.
select
  'column_types' as check_name,
  case
    when bool_and(
      (column_name = 'id' and data_type = 'uuid')
      or (column_name = 'room_type_id' and data_type = 'uuid')
      or (column_name = 'start_date' and data_type = 'date')
      or (column_name = 'end_date' and data_type = 'date')
      or (column_name = 'override_price' and data_type = 'numeric')
      or (column_name = 'min_stay_nights' and data_type = 'integer')
      or (column_name = 'created_at' and data_type = 'timestamp with time zone')
    ) then 'PASS' else 'FAIL'
  end as verdict,
  string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then ' NOT NULL' else '' end), ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'rate_overrides';

-- 3) FK room_type_id -> room_types(id) ON DELETE CASCADE
select
  'fk_room_type_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.rate_overrides'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%room_types%';

-- 4) min_stay_nights is nullable (is_nullable = YES)
select
  'min_stay_nights_nullable' as check_name,
  case when is_nullable = 'YES' then 'PASS' else 'FAIL' end as verdict,
  'is_nullable=' || is_nullable as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'rate_overrides'
  and column_name = 'min_stay_nights';

-- 5) valid_rate_override_dates CHECK (end_date >= start_date)
select
  'valid_dates_check' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.rate_overrides'::regclass
  and conname = 'valid_rate_override_dates';

-- 6) override_price >= 0 check exists
select
  'override_price_check' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ':' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.rate_overrides'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%override_price%';

-- 7) EXCLUDE constraint prevent_rate_override_overlap (GiST) exists
select
  'exclude_no_overlap' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ':' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.rate_overrides'::regclass
  and conname = 'prevent_rate_override_overlap';

-- 8) Indexes on room_type_id and (room_type_id, start_date, end_date)
select
  'indexes_exist' as check_name,
  case when count(*) >= 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(indexname || ':' || indexdef, ' | ') as detail
from pg_indexes
where schemaname = 'public' and tablename = 'rate_overrides'
  and indexname in ('idx_rate_overrides_room_type_id','idx_rate_overrides_dates');

-- 9) RLS is enabled.
select
  'rls_enabled' as check_name,
  case when relrowsecurity then 'PASS' else 'FAIL' end as verdict,
  'relrowsecurity=' || relrowsecurity as detail
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'rate_overrides';

-- 10) Policies exist (select + manage)
select
  'policies_exist' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) as detail
from pg_policies
where schemaname = 'public' and tablename = 'rate_overrides';

-- 11) btree_gist extension is installed (required for EXCLUDE with = on uuid)
select
  'btree_gist_extension' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(extname || ' ' || extversion, ', ') as detail
from pg_extension
where extname = 'btree_gist';
