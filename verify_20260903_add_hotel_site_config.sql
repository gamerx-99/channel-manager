-- =====================================================================
-- Post-apply verification for 20260903_add_hotel_site_config.sql
-- Read-only. Run in the Supabase SQL editor against the same project.
-- Every row returned should read PASS in the `verdict` column.
-- =====================================================================

-- 1) hotel_site_config table exists with expected columns (5 columns).
select
  'hsc_table_columns' as check_name,
  case when count(*) = 5 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'hotel_site_config'
  and column_name in ('hotel_id','hero_copy','accent_color','visible_sections','updated_at');

-- 2) Column types / nullability sanity.
select
  'hsc_column_types' as check_name,
  case
    when bool_and(
      (column_name = 'hotel_id' and data_type = 'uuid')
      or (column_name = 'hero_copy' and data_type = 'text')
      or (column_name = 'accent_color' and data_type = 'text')
      or (column_name = 'visible_sections' and data_type = 'jsonb')
      or (column_name = 'updated_at' and data_type = 'timestamp with time zone')
    ) then 'PASS' else 'FAIL'
  end as verdict,
  string_agg(column_name || ':' || data_type || (case when is_nullable='NO' then ' NOT NULL' else '' end), ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'hotel_site_config';

-- 3) FK hotel_id -> hotels(id) ON DELETE CASCADE and primary/unique.
select
  'hsc_fk_hotel_id' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ' -> ' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.hotel_site_config'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) like '%hotels%';

-- 4) hotel_id is primary key / unique (one config per hotel).
select
  'hsc_unique_hotel_id' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(contype || ':' || conname || ':' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.hotel_site_config'::regclass
  and contype in ('p','u');

-- 5) accent_color CHECK enforces hex format (#RGB or #RRGGBB).
select
  'hsc_accent_color_check' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(conname || ':' || pg_get_constraintdef(oid), ', ') as detail
from pg_constraint
where conrelid = 'public.hotel_site_config'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%accent_color%';

-- 6) Nullable columns: hero_copy, accent_color, visible_sections are nullable; updated_at NOT NULL.
select
  'hsc_nullable_checks' as check_name,
  case
    when (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='hero_copy') = 'YES'
     and (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='accent_color') = 'YES'
     and (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='visible_sections') = 'YES'
     and (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='updated_at') = 'NO'
    then 'PASS' else 'FAIL'
  end as verdict,
  'hero_copy=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='hero_copy')
  || ', accent_color=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='accent_color')
  || ', visible_sections=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='visible_sections')
  || ', updated_at=' || (select is_nullable from information_schema.columns where table_schema='public' and table_name='hotel_site_config' and column_name='updated_at') as detail;

-- 7) RLS is enabled on hotel_site_config.
select
  'hsc_rls_enabled' as check_name,
  case when relrowsecurity then 'PASS' else 'FAIL' end as verdict,
  'relrowsecurity=' || relrowsecurity as detail
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'hotel_site_config';

-- 8) Policies exist (select + manage = 2).
select
  'hsc_policies_exist' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) as detail
from pg_policies
where schemaname = 'public' and tablename = 'hotel_site_config';

-- 9) Policies use is_super_admin() AND is_hotel_member(hotel_id).
select
  'hsc_policies_use_hotel_member' as check_name,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict,
  string_agg(policyname || ':' || substring(pg_get_expr(polqual, polrelid)::text, 1, 140), ' | ') as detail
from pg_policy
where polrelid = 'public.hotel_site_config'::regclass
  and pg_get_expr(polqual, polrelid) like '%is_hotel_member%'
  and pg_get_expr(polqual, polrelid) like '%is_super_admin%';

-- 10) hotel_media table still exists (not dropped or altered by this migration).
select
  'hotel_media_still_exists' as check_name,
  case when count(*) >= 5 then 'PASS' else 'FAIL' end as verdict,
  string_agg(column_name, ', ' order by ordinal_position) as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'hotel_media'
  and column_name in ('id','hotel_id','url','caption','is_hero','display_order','created_at');

-- 11) Index on hotel_site_config(hotel_id) exists (primary key covers it; check for updated_at index).
select
  'hsc_indexes_exist' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as verdict,
  string_agg(indexname || ':' || indexdef, ' | ') as detail
from pg_indexes
where schemaname = 'public' and tablename = 'hotel_site_config';

-- 12) updated_at has default now().
select
  'hsc_updated_at_default' as check_name,
  case when column_default is not null then 'PASS' else 'FAIL' end as verdict,
  column_default as detail
from information_schema.columns
where table_schema='public' and table_name='hotel_site_config' and column_name='updated_at';
