-- =====================================================================
-- Migration: hotel_site_config (per-hotel white-label site config)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   Per-hotel site branding/config. One row per hotel (hotel_id UNIQUE
--   FK -> hotels ON DELETE CASCADE). hero_copy / accent_color /
--   visible_sections are nullable. accent_color is hex-validated.
--   updated_at is maintained by application upsert (no trigger needed
--   for this iteration).
--
--   hotel_media already exists (see supabase_migration_production.sql);
--   this migration does NOT recreate or alter hotel_media — write
--   helpers are added at the application layer only.
--
--   RLS is row-scoped through hotel_id via is_super_admin() /
--   is_hotel_member(). Application procedures are gated by
--   property.manage_profile.
-- =====================================================================

begin;

create table if not exists public.hotel_site_config (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  hero_copy text,
  accent_color text check (accent_color ~ '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'),
  visible_sections jsonb,
  updated_at timestamptz not null default now()
);

-- Unique is implied by primary key; add explicit unique index for clarity if
-- a future migration switches to a surrogate PK.
create unique index if not exists uq_hotel_site_config_hotel_id
  on public.hotel_site_config (hotel_id);

create index if not exists idx_hotel_site_config_updated_at
  on public.hotel_site_config (updated_at desc);

alter table public.hotel_site_config enable row level security;

drop policy if exists hotel_site_config_select on public.hotel_site_config;
drop policy if exists hotel_site_config_manage on public.hotel_site_config;

-- Select: members of the config's hotel (or super_admin) can read.
create policy hotel_site_config_select on public.hotel_site_config
  for select
  using (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  );

-- All (insert/update/delete): same membership gate; write additionally
-- enforced in the application layer via requireHotelPermission(...,
-- 'property.manage_profile').
create policy hotel_site_config_manage on public.hotel_site_config
  for all
  using (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  )
  with check (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  );

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   drop table if exists public.hotel_site_config;
--   commit;
-- =====================================================================
