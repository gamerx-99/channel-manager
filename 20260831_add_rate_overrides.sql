-- =====================================================================
-- Migration: rate_overrides (seasonal / date-range pricing overrides)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   Pricing overrides let revenue_manager / hotel_owner define date-range
--   rate overrides per room type. Booking/availability logic can then
--   resolve the effective rate via server/pricing.ts instead of always
--   using room_types.base_price. This migration only adds the storage
--   layer; application permission gating is revenue.manage_pricing_rules
--   (already in shared/authorization.ts for hotel_owner + revenue_manager).
--
--   Overlapping ranges for the same room_type_id are rejected at the
--   database level via an EXCLUDE constraint (GiST + daterange).
-- =====================================================================

begin;

create extension if not exists btree_gist;

create table if not exists public.rate_overrides (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  override_price numeric(12,2) not null check (override_price >= 0),
  min_stay_nights integer check (min_stay_nights is null or min_stay_nights > 0),
  created_at timestamptz not null default now(),
  constraint valid_rate_override_dates check (end_date >= start_date)
);

-- Indexes for filtering by room type and date scans
create index if not exists idx_rate_overrides_room_type_id
  on public.rate_overrides (room_type_id);
create index if not exists idx_rate_overrides_dates
  on public.rate_overrides (room_type_id, start_date, end_date);

-- Reject overlapping ranges for the same room type.
-- Uses inclusive range '[]' so shared boundary dates are treated as overlapping
-- (2026-08-10..2026-08-15 and 2026-08-15..2026-08-20 overlap on the 15th).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prevent_rate_override_overlap'
      and conrelid = 'public.rate_overrides'::regclass
  ) then
    alter table public.rate_overrides
      add constraint prevent_rate_override_overlap
      exclude using gist (
        room_type_id with =,
        daterange(start_date, end_date, '[]') with &&
      );
  end if;
end $$;

alter table public.rate_overrides enable row level security;

drop policy if exists rate_overrides_select on public.rate_overrides;
drop policy if exists rate_overrides_manage on public.rate_overrides;

-- Select: any member of the hotel (or platform reader via is_hotel_member) can read.
create policy rate_overrides_select on public.rate_overrides
  for select
  using (
    exists (
      select 1
      from public.room_types rt
      where rt.id = room_type_id
        and (public.is_super_admin() or public.is_hotel_member(rt.hotel_id))
    )
  );

-- All (insert/update/delete): same membership gate; write additionally
-- enforced in the application layer via requireHotelPermission(...,
-- 'revenue.manage_pricing_rules').
create policy rate_overrides_manage on public.rate_overrides
  for all
  using (
    exists (
      select 1
      from public.room_types rt
      where rt.id = room_type_id
        and (public.is_super_admin() or public.is_hotel_member(rt.hotel_id))
    )
  )
  with check (
    exists (
      select 1
      from public.room_types rt
      where rt.id = room_type_id
        and (public.is_super_admin() or public.is_hotel_member(rt.hotel_id))
    )
  );

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   drop table if exists public.rate_overrides;
--   commit;
-- =====================================================================
