-- =====================================================================
-- Post-apply verification for 20260902_add_message_threads.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) message_threads table exists with expected columns (4 columns).
select
  'mt_table_columns' as check_name,
  case when count(*) = 4 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'message_threads'
  and column_name in ('id','hotel_id','booking_id','created_at');

-- 2) messages table exists with expected columns (5 columns).
select
  'msg_table_columns' as check_name,
  case when count(*) = 5 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
  and column_name in ('id','thread_id','sender_user_id','body','created_at');

-- 3) Column types / nullability sanity for message_threads.
select
  'mt_column_types' as check_name,
  case
    when bool_and(
      (column_name = 'id' and data_type = 'uuid')
      or (column_name = 'hotel_id' and data_type = 'uuid')
      or (column_name = 'booking_id' and data_type = 'uuid')
      or (column_name = 'created_at' and data_type = 'timestamp with time zone')
    ) then 'PASS' else 'FAIL'
  end as verdict,
  string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then ' NOT NULL' else '' end), ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'message_threads';

-- 4) Column types / nullability sanity for messages.
select
  'msg_column_types' as check_name,
  case
    when bool_and(
      (column_name = 'id' and data_type = 'uuid')
      or (column_name = 'thread_id' and data_type = 'uuid')
      or (column_name = 'sender_user_id' and data_type = 'uuid')
      or (column_name = 'body' and data_type = 'text')
      or (column_name = 'created_at' and data_type = 'timestamp with time zone')
    ) then 'PASS' else 'FAIL'
  end as verdict,
  string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then ' NOT NULL' else '' end), ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'messages';

-- 5) FK message_threads.hotel_id -> hotels(id) ON DELETE CASCADE
select
  'fk_mt_hotel_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.message_threads'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%hotels%';

-- 6) FK message_threads.booking_id -> bookings(id) ON DELETE SET NULL (nullable)
select
  'fk_mt_booking_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.message_threads'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%bookings%';

-- 7) FK messages.thread_id -> message_threads(id) ON DELETE CASCADE
select
  'fk_msg_thread_id' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.messages'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%message_threads%';

-- 8) Nullable columns: message_threads.booking_id, messages.sender_user_id, messages.body NOT NULL enforced
select
  'nullable_checks' as check_name,
  case
    when (select is_nullable from information_schema.columns where table_schema='public' and table_name='message_threads' and column_name='booking_id') = 'YES'
     and (select is_nullable from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sender_user_id') = 'YES'
     and (select is_nullable from information_schema.columns where table_schema='public' and table_name='messages' and column_name='body') = 'NO'
    then 'PASS' else 'FAIL'
  end as verdict,
  'booking_id=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='message_threads' and column_name='booking_id')
  || ', sender_user_id=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sender_user_id')
  || ', body=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='messages' and column_name='body') as detail;

-- 9) Indexes on message_threads(hotel_id) and messages(thread_id)
select
  'indexes_exist' as check_name,
  case when count(*) >= 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(indexname || ':' || indexdef, ' | ') as detail
from pg_indexes
where schemaname = 'public'
  and (
    (tablename = 'message_threads' and indexname = 'idx_message_threads_hotel_id')
    or (tablename = 'messages' and indexname = 'idx_messages_thread_id')
  );

-- 10) RLS is enabled on both tables.
select
  'rls_enabled' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(relname || ':relrowsecurity=' || relrowsecurity, ', ' order by relname) as detail
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('message_threads','messages')
  and relrowsecurity = true;

-- 11) Policies exist (2 per table = 4 total: select + manage each)
select
  'policies_exist' as check_name,
  case when count(*) = 4 then 'PASS' else 'FAIL' end as verdict,
  string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ' order by tablename, policyname) as detail
from pg_policies
where schemaname = 'public' and tablename in ('message_threads','messages');

-- 12) Policies use is_super_admin() AND is_hotel_member(hotel_id)
select
  'policies_use_hotel_member' as check_name,
  case when count(*) = 4 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ':' || substring(pg_get_expr(polqual, polrelid)::text, 1, 120), ' | ') as detail
from pg_policy
where polrelid in ('public.message_threads'::regclass, 'public.messages'::regclass)
  and pg_get_expr(polqual, polrelid) like '%is_hotel_member%'
  and pg_get_expr(polqual, polrelid) like '%is_super_admin%';
