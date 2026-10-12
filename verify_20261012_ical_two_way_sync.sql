-- Read-only verification for 20261012_ical_two_way_sync.sql.
-- Run every statement in the SQL editor; every row should read PASS.

-- 1. Table exists with the expected unique constraint.
select
  case when count(*) = 1 then 'PASS' else 'FAIL: ota_import_blocks table/constraint missing' end as check_unique_constraint
from pg_constraint
where conrelid = 'public.ota_import_blocks'::regclass
  and conname = 'uq_ota_import_blocks_unique';

-- 2. Supporting index exists.
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end as check_hotel_date_index
from pg_indexes
where schemaname = 'public'
  and tablename = 'ota_import_blocks'
  and indexname = 'idx_ota_import_blocks_hotel_date';

-- 3. Feed-token column exists.
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end as check_ical_feed_token_column
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ota_connections'
  and column_name = 'ical_feed_token';

-- 4. Token-uniqueness trigger is in place.
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end as check_feed_token_trigger
from pg_trigger
where tgrelid = 'public.ota_connections'::regclass
  and tgname = 'trg_ota_connections_single_ical_feed_token'
  and not tgisinternal;

-- 5. Token-uniqueness function exists.
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end as check_token_fn
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'enforce_single_ical_feed_token';

-- 5b. Block-count helper function exists with the expected signature.
select
  case when to_regprocedure('public.get_ota_blocked_room_type_counts(uuid,date,date)') is not null
    then 'PASS' else 'FAIL' end as check_block_count_fn;

-- 5c. Block counts are per (room type, night) and callers take MAX across the
-- stay window (a whole stay needs every night free). Catches min()/sum()
-- regressions that under/over-block multi-night stays.
select
  case when p1.prosrc like '%group by b.room_type_id, b.date%'
    and p2.prosrc like '%max(blocked_counts.rooms_blocked)%'
    and p3.prosrc like '%max(blocked_counts.rooms_blocked)%'
    then 'PASS' else 'FAIL' end as check_block_count_semantics
from pg_proc p1
join pg_proc p2 on p2.oid = to_regprocedure('public.get_public_room_type_availability(uuid,date,date)')
join pg_proc p3 on p3.oid = to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)')
where p1.oid = to_regprocedure('public.get_ota_blocked_room_type_counts(uuid,date,date)');


-- 6. RLS enabled on ota_import_blocks.
select
  case when relrowsecurity then 'PASS' else 'FAIL' end as check_rls_enabled
from pg_class
where oid = 'public.ota_import_blocks'::regclass;

-- 7. Exactly three RLS policies exist on ota_import_blocks (select/insert/delete).
select
  case when count(*) = 3 then 'PASS' else 'FAIL' end as check_policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'ota_import_blocks';

-- 8. Backfill: no hotel has connections with mixed token state (some null, some set),
--    and no hotel carries more than one distinct token (the trigger's own rule).
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as check_token_backfill_complete
from (
  select hotel_id
  from public.ota_connections
  group by hotel_id
  having count(*) > count(ical_feed_token)
    and count(ical_feed_token) > 0
) mixed;

select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as check_single_token_per_hotel
from (
  select hotel_id
  from public.ota_connections
  group by hotel_id
  having count(distinct ical_feed_token) > 1
) forked;

-- 9. Availability RPCs were replaced with the block-aware versions (grants intact).
select
  case when to_regprocedure('public.get_public_room_type_availability(uuid,date,date)') is not null
    then 'PASS' else 'FAIL' end as check_availability_fn;

select
  case when to_regprocedure('public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)') is not null
    then 'PASS' else 'FAIL' end as check_availability_guests_fn;

-- 10. Execute grants survived the function replacement.
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end as check_availability_grants
from (
  select has_function_privilege('anon', 'public.get_public_room_type_availability(uuid,date,date)', 'execute') as anon_ok1,
    has_function_privilege('anon', 'public.get_public_room_type_availability_for_guests(uuid,date,date,integer,jsonb)', 'execute') as anon_ok2
) grants
where grants.anon_ok1 and grants.anon_ok2;

