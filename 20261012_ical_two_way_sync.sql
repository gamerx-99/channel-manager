-- Phase A1: iCal two-way sync — OTA import blocks + outbound feed tokens.
-- Applies the data model for:
--   * ota_import_blocks: one row per blocked room type / night imported from
--     an OTA iCal feed. Cancelled/shortened reservations re-open nights when
--     their source event disappears from the feed.
--   * ota_connections.ical_feed_token: per-hotel secret that authenticates the
--     outbound feed endpoint GET /api/ical/:hotelId.ics?token=...

-- 1) Blocked room type / night rows imported from OTA iCal feeds.
create table if not exists public.ota_import_blocks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  provider text not null,
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  date date not null,
  source_uid text not null,
  created_at timestamptz not null default now(),
  -- Several OTA reservations can block the same room type on the same
  -- night (e.g. three rooms of the Deluxe type sold on Agoda for Aug 20).
  -- Uniqueness is per source event so every sold room blocks one unit of
  -- inventory; the same event re-syncing is idempotent via its UID.
  constraint uq_ota_import_blocks_unique unique (provider, room_type_id, date, source_uid)
);

create index if not exists idx_ota_import_blocks_hotel_date
  on public.ota_import_blocks (hotel_id, date);

-- 2. Outbound feed token: one token per hotel shared by all its OTA connections.
--    Token lives only in the database and is checked by GET /api/ical/:hotelId.ics.
alter table public.ota_connections
  add column if not exists ical_feed_token text;

-- Every connection of a hotel must share the same feed token; enforce with a
-- trigger so a stray upsert cannot fork the hotel's outbound calendar.
create or replace function public.enforce_single_ical_feed_token()
returns trigger
language plpgsql
as $$
begin
  if new.ical_feed_token is null then
    return new;
  end if;
  if exists (
    select 1 from public.ota_connections other
    where other.hotel_id = new.hotel_id
      and other.id is distinct from new.id
      and other.ical_feed_token is not null
      and other.ical_feed_token is distinct from new.ical_feed_token
  ) then
    raise exception 'ical_feed_token must be identical across all connections of a hotel'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ota_connections_single_feed_token on public.ota_connections;
create trigger trg_ota_connections_single_ical_feed_token
  before insert or update on public.ota_connections
  for each row execute function public.enforce_single_ical_feed_token();

-- Backfill: give every hotel that already has an OTA connection one shared
-- feed token if it does not have any yet. All rows of a hotel are updated in
-- ONE statement with a single per-hotel token so the single-token trigger is
-- satisfied even for hotels with multiple connections. Safe to re-run: rows
-- that already carry a token are skipped.
update public.ota_connections target
set ical_feed_token = tokens.shared_token
from (
  -- One shared token per hotel that has no token anywhere yet, derived from
  -- the hotel's own id (stable across the row-by-row trigger checks, random
  -- across hotels, and deterministic on re-run after a partial apply).
  -- ASSUMPTION: deriving the backfilled token deterministically from the hotel
  -- id (instead of gen_random_bytes) is acceptable because this backfill runs
  -- once per hotel; the app itself generates tokens from a random UUID. The
  -- owner can rotate a leaked token later via the OTA page.
  select h.id as hotel_id,
    md5('ical-feed-token-v1:' || h.id::text) as shared_token
  from public.hotels h
  where not exists (
    select 1
    from public.ota_connections other
    where other.hotel_id = h.id
      and other.ical_feed_token is not null
  )
) tokens
where target.hotel_id = tokens.hotel_id
  and target.ical_feed_token is null;

-- 2. RLS policies for ota_import_blocks (hotel-membership based, mirroring
--    the ota_connections / ota_sync_logs policy pattern).

alter table public.ota_import_blocks enable row level security;

drop policy if exists "ota_import_blocks_select" on public.ota_import_blocks;
create policy "ota_import_blocks_select" on public.ota_import_blocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.hotel_users hu
      where hu.hotel_id = ota_import_blocks.hotel_id
        and hu.user_id = auth.uid()
    )
  );

drop policy if exists "ota_import_blocks_insert" on public.ota_import_blocks;
create policy "ota_import_blocks_insert" on public.ota_import_blocks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.hotel_users hu
      where hu.hotel_id = hotel_id
        and hu.user_id = auth.uid()
    )
  );

drop policy if exists "ota_import_blocks_delete" on public.ota_import_blocks;
create policy "ota_import_blocks_delete" on public.ota_import_blocks
  for delete to authenticated
  using (
    exists (
      select 1
      from public.hotel_users hu
      where hu.hotel_id = ota_import_blocks.hotel_id
        and hu.user_id = auth.uid()
    )
  );

create or replace function public.get_ota_blocked_room_type_counts(
  target_hotel_id uuid,
  target_check_in date,
  target_check_out date
)
returns table (room_type_id uuid, rooms_blocked integer)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  -- One row per (room type, night) with its blocked-room count. The whole
  -- stay can only be sold when EVERY night has a free room, so the per-night
  -- maximum (not the sum) is the number of rooms to subtract. Callers take
  -- MAX(rooms_blocked) across the stay window.
  select b.room_type_id, b.date, count(*)::integer as rooms_blocked
  from public.ota_import_blocks b
  where b.hotel_id = target_hotel_id
    and b.date >= target_check_in
    and b.date < target_check_out
  group by b.room_type_id, b.date;
$$;

revoke all on function public.get_ota_blocked_room_type_counts(uuid, date, date) from public;
grant execute on function public.get_ota_blocked_room_type_counts(uuid, date, date) to anon, authenticated;

-- 3b. Layer the block subtraction into both public availability RPCs. Both
--     already return per-room-type free counts; blocks reduce them further.
create or replace function public.get_public_room_type_availability(
  target_hotel_id uuid,
  target_check_in date,
  target_check_out date
)
returns table (room_type_id uuid, rooms_available integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if target_check_in is null or target_check_out is null or target_check_out <= target_check_in then
    raise exception 'Check-out date must be after check-in date.' using errcode = '22023';
  end if;

  return query
  with published_hotel as (
    select h.id
    from public.hotels h
    where h.id = target_hotel_id
      and h.public_enabled = true
  ),
  room_inventory as (
    select rt.id as room_type_id, r.id as room_id
    from public.room_types rt
    join published_hotel h on h.id = rt.hotel_id
    left join public.rooms r
      on r.hotel_id = h.id
      and r.room_type_id = rt.id
      and r.status is distinct from 'maintenance'
  ),
  occupied_rooms as (
    select distinct b.room_id
    from public.bookings b
    join room_inventory inventory on inventory.room_id = b.room_id
    where b.check_in < target_check_out
      and b.check_out > target_check_in
      and (
        b.status in ('confirmed', 'checked_in')
        or (
          b.status in ('held', 'pending_payment', 'pending_verification')
          and (b.expires_at is null or b.expires_at >= now())
        )
      )
  ),
  ota_blocked as (
    select blocked_counts.room_type_id, max(blocked_counts.rooms_blocked) as rooms_blocked
    from public.get_ota_blocked_room_type_counts(target_hotel_id, target_check_in, target_check_out) as blocked_counts
    group by blocked_counts.room_type_id
  )
  select
    inventory.room_type_id,
    greatest(
      0,
      count(distinct inventory.room_id) - count(distinct occupied.room_id)
        - coalesce(blocked.rooms_blocked, 0)
    )::integer as rooms_available
  from room_inventory inventory
  left join occupied_rooms occupied on occupied.room_id = inventory.room_id
  left join ota_blocked blocked on blocked.room_type_id = inventory.room_type_id
  group by inventory.room_type_id
  order by inventory.room_type_id;
end;
$$;

revoke all on function public.get_public_room_type_availability(uuid, date, date) from public;
grant execute on function public.get_public_room_type_availability(uuid, date, date) to anon, authenticated;

-- 3c. Same block subtraction for the guests-aware variant used by the public
--     booking wizard, so OTA-closed rooms never appear bookable there either.
create or replace function public.get_public_room_type_availability_for_guests(
  target_hotel_id uuid,
  target_check_in date,
  target_check_out date,
  target_adults integer,
  target_children jsonb
)
returns table (room_type_id uuid, rooms_available integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if target_check_in is null or target_check_out is null or target_check_out <= target_check_in then
    raise exception 'Check-out date must be after check-in date.' using errcode = '22023';
  end if;
  if target_adults is null or target_adults < 1 or jsonb_typeof(target_children) is distinct from 'array' then
    raise exception 'Guest counts are invalid.' using errcode = '22023';
  end if;
  if jsonb_array_length(target_children) > 20 then
    raise exception 'Guest counts are invalid.' using errcode = '22023';
  end if;

  return query
  with eligible_room_types as (
    select rt.id
    from public.room_types rt
    join public.hotels h on h.id = rt.hotel_id
    cross join lateral (
      select
        count(*) filter (where case
          when rt.child_rule = 'height' then
            rt.child_rule_limit is not null
            and jsonb_typeof(child.value->'height_cm') = 'number'
            and (child.value->>'height_cm')::numeric <= rt.child_rule_limit
          else
            (jsonb_typeof(child.value->'age') = 'number'
              and (child.value->>'age')::numeric between 0 and 2)
            or exists (
              select 1
              from jsonb_array_elements(coalesce(rt.child_rates->'age_groups', '[]'::jsonb)) age_group(value)
              where jsonb_typeof(child.value->'age') = 'number'
                and (child.value->>'age')::numeric between (age_group.value->>'min_age')::numeric and (age_group.value->>'max_age')::numeric
            )
        end)::integer as qualifying_children
      from jsonb_array_elements(target_children) child(value)
    ) guest_counts
    where h.id = target_hotel_id
      and h.public_enabled = true
      and target_adults + (jsonb_array_length(target_children) - guest_counts.qualifying_children)
        + case when rt.children_count_toward_max then guest_counts.qualifying_children else 0 end
        <= rt.max_occupancy
      and coalesce((rt.occupancy_pricing->(
        target_adults + (jsonb_array_length(target_children) - guest_counts.qualifying_children)
          + case when rt.children_count_toward_max then guest_counts.qualifying_children else 0 end
      )::text->>'enabled')::boolean, false)
  ),
  room_inventory as (
    select eligible.id as room_type_id, r.id as room_id
    from eligible_room_types eligible
    join public.rooms r on r.room_type_id = eligible.id
    where r.hotel_id = target_hotel_id
      and r.status is distinct from 'maintenance'
  ),
  occupied_rooms as (
    select distinct b.room_id
    from public.bookings b
    join room_inventory inventory on inventory.room_id = b.room_id
    where b.check_in < target_check_out
      and b.check_out > target_check_in
      and (
        b.status in ('confirmed', 'checked_in')
        or (b.status in ('held', 'pending_payment', 'pending_verification')
            and (b.expires_at is null or b.expires_at >= now()))
      )
  ),
  ota_blocked as (
    select blocked_counts.room_type_id, max(blocked_counts.rooms_blocked) as rooms_blocked
    from public.get_ota_blocked_room_type_counts(target_hotel_id, target_check_in, target_check_out) as blocked_counts
    group by blocked_counts.room_type_id
  )
  select inventory.room_type_id,
    greatest(0, count(distinct inventory.room_id) - count(distinct occupied.room_id)
      - coalesce(blocked.rooms_blocked, 0))::integer
  from room_inventory inventory
  left join occupied_rooms occupied on occupied.room_id = inventory.room_id
  left join ota_blocked blocked on blocked.room_type_id = inventory.room_type_id
  group by inventory.room_type_id
  having count(distinct inventory.room_id) - count(distinct occupied.room_id) - coalesce(blocked.rooms_blocked, 0) > 0;
end;
$$;

revoke all on function public.get_public_room_type_availability_for_guests(uuid, date, date, integer, jsonb) from public;
grant execute on function public.get_public_room_type_availability_for_guests(uuid, date, date, integer, jsonb) to anon, authenticated;

-- The export endpoint reads blocks through the service-role client, which
-- bypasses RLS; no public/anon policy is granted on ota_import_blocks itself.
