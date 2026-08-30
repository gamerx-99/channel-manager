-- =====================================================================
-- Post-apply verification for 20260901_add_housekeeping_tasks.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) Table exists with the expected columns (7 columns).
select
  'table_columns' as check_name,
  case when count(*) = 7 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'housekeeping_tasks'
  and column_name in ('id','room_id','booking_id','assigned_to','due_date','status','created_at');

-- 2) Column types / nullability sanity.
select
  'column_types' as check_name,
  case
    when bool_and(
      (column_name = 'id' and data_type = 'uuid')
      or (column_name = 'room_id' and data_type = 'uuid')
      or (column_name = 'booking_id' and data_type = 'uuid')
      or (column_name = 'assigned_to' and data_type = 'uuid')
      or (column_name = 'due_date' and data_type = 'date')
      or (column_name = 'status' and data_type = 'text')
      or (column_name = 'created_at' and data_type = 'timestamp with time zone')
    ) then 'PASS' else 'FAIL'
  end as verdict,
  string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then ' NOT NULL' else '' end), ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'housekeeping_tasks';

-- 3) FK room_id -> rooms(id) ON DELETE CASCADE
select
  'fk_room_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.housekeeping_tasks'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%rooms%';

-- 4) FK booking_id -> bookings(id) (nullable, ON DELETE SET NULL)
select
  'fk_booking_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.housekeeping_tasks'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%bookings%';

-- 5) booking_id and assigned_to are nullable
select
  'nullable_booking_assigned' as check_name,
  case when bool_and(is_nullable = 'YES') then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name || ':is_nullable=' || is_nullable, ', ') as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'housekeeping_tasks'
  and column_name in ('booking_id','assigned_to');

-- 6) Status CHECK (pending / in_progress / done)
select
  'status_check' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ':' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.housekeeping_tasks'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%status%';

-- 7) Indexes on (room_id) and (due_date)
select
  'indexes_exist' as check_name,
  case when count(*) >= 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(indexname || ':' || indexdef, ' | ') as detail
from pg_indexes
where schemaname = 'public' and tablename = 'housekeeping_tasks'
  and indexname in ('idx_housekeeping_tasks_room_id','idx_housekeeping_tasks_due_date');

-- 8) RLS is enabled.
select
  'rls_enabled' as check_name,
  case when relrowsecurity then 'PASS' else 'FAIL' end as verdict,
  'relrowsecurity=' || relrowsecurity as detail
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'housekeeping_tasks';

-- 9) Policies exist (select + manage)
select
  'policies_exist' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) as detail
from pg_policies
where schemaname = 'public' and tablename = 'housekeeping_tasks';

-- 10) Policies use is_super_admin() OR is_hotel_member(hotel_id via rooms)
select
  'policies_use_hotel_member' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ':' || substring(pg_get_expr(polqual, polrelid)::text, 1, 120), ' | ') as detail
from pg_policy
where polrelid = 'public.housekeeping_tasks'::regclass
  and pg_get_expr(polqual, polrelid) like '%is_hotel_member%'
  and pg_get_expr(polqual, polrelid) like '%is_super_admin%';
