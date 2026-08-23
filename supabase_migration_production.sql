-- =============================================================================
-- Channel Manager MVP — Production Supabase Schema, RLS & Constraints Migration
-- PostgreSQL / Supabase. Run with the server-side service secret only.
-- =============================================================================

create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Core schema
-- -----------------------------------------------------------------------------

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text not null,
  owner_contact text not null,
  public_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.hotel_users (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping', 'api_service')),
  created_at timestamptz not null default now()
);

create table if not exists public.hotel_media (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  url text not null,
  caption text,
  is_hero boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  capacity integer not null check (capacity > 0),
  base_price numeric(12,2) not null check (base_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  room_number text not null,
  status text not null default 'available' check (status in ('available', 'occupied', 'maintenance')),
  constraint unique_room_per_hotel unique (hotel_id, room_number)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  guest_name text not null,
  check_in date not null,
  check_out date not null,
  price numeric(12,2) not null check (price >= 0),
  source text not null default 'manual' check (source in ('manual', 'walk-in', 'phone')),
  status text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint valid_booking_dates check (check_out > check_in)
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender char(1) check (gender in ('M', 'F')),
  passport_no text not null,
  nationality_code varchar(3) not null check (nationality_code ~ '^[A-Z]{3}$'),
  birth_date date not null,
  phone_no text,
  created_at timestamptz not null default now()
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  date date not null,
  price numeric(12,2) not null check (price >= 0),
  rooms_available integer not null check (rooms_available >= 0),
  constraint unique_room_type_date unique (room_type_id, date)
);

create table if not exists public.hotel_domains (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  domain text not null unique,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ota_connections (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  ical_import_url text,
  ical_export_url text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint uq_hotel_provider unique (hotel_id, provider)
);

create table if not exists public.ota_sync_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  provider text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  action text not null,
  status text not null check (status in ('success', 'failed')),
  payload jsonb,
  response jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Approved indexes. Unique constraints above also create their backing indexes.
-- -----------------------------------------------------------------------------

create index if not exists idx_hotel_users_user_id on public.hotel_users (user_id);
create index if not exists idx_hotel_users_hotel_id on public.hotel_users (hotel_id);
create index if not exists idx_hotel_media_hotel_order on public.hotel_media (hotel_id, display_order);
create index if not exists idx_room_types_hotel_id on public.room_types (hotel_id);
create index if not exists idx_rooms_hotel_id on public.rooms (hotel_id);
create index if not exists idx_rooms_room_type_id on public.rooms (room_type_id);
create index if not exists idx_bookings_hotel_dates on public.bookings (hotel_id, check_in, check_out);
create index if not exists idx_bookings_room_dates on public.bookings (room_id, check_in, check_out);
create index if not exists idx_guests_booking_id on public.guests (booking_id);
create index if not exists idx_availability_room_type_date on public.availability (room_type_id, date);
create index if not exists idx_hotel_domains_hotel_id on public.hotel_domains (hotel_id);
create index if not exists idx_hotel_domains_verified on public.hotel_domains (domain) where verified = true;
create index if not exists idx_ota_connections_hotel_id on public.ota_connections (hotel_id);
create index if not exists idx_ota_sync_logs_hotel_time on public.ota_sync_logs (hotel_id, created_at desc);

create unique index if not exists uq_hotel_user_membership on public.hotel_users (hotel_id, user_id);

-- Exactly one Hotel Admin (hotel_owner) is allowed per property. This is the
-- database-level backstop for the same invariant enforced by tRPC procedures.
drop index if exists public.uq_one_hotel_admin_per_hotel;
create unique index uq_one_hotel_admin_per_hotel
  on public.hotel_users (hotel_id)
  where role = 'hotel_owner';

-- Existing deployments created hotel_users with the legacy two-role check.
-- Replace that check idempotently before the six-role policy is used.
do $$
begin
  alter table public.hotel_users drop constraint if exists hotel_users_role_check;
  alter table public.hotel_users
    add constraint hotel_users_role_check
    check (role in ('super_admin', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping', 'api_service'));
exception
  when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER helpers. They are declared after hotel_users exists so the
-- first migration is executable, and they bypass hotel_users RLS recursion.
-- -----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.hotel_users hu
    where hu.user_id = auth.uid()
      and hu.role = 'super_admin'
  );
$$;

create or replace function public.is_hotel_member(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or exists (
        select 1
        from public.hotel_users hu
        where hu.user_id = auth.uid()
          and hu.hotel_id = target_hotel_id
      );
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_hotel_member(uuid) from public;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.is_hotel_member(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Approved double-booking protection. daterange is native to date columns and
-- [) means checkout is available for another guest on that same date.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prevent_double_booking'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint prevent_double_booking
      exclude using gist (
        room_id with =,
        daterange(check_in, check_out, '[)') with &&
      )
      where (room_id is not null and status in ('confirmed', 'checked_in'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- RLS is enabled on every application table before policies are created.
-- -----------------------------------------------------------------------------

alter table public.hotels enable row level security;
alter table public.hotel_users enable row level security;
alter table public.hotel_media enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.guests enable row level security;
alter table public.availability enable row level security;
alter table public.hotel_domains enable row level security;
alter table public.ota_connections enable row level security;
alter table public.ota_sync_logs enable row level security;

-- Re-running this migration is safe: replace only these policy definitions.
drop policy if exists hotels_select on public.hotels;
drop policy if exists hotels_manage on public.hotels;
drop policy if exists hotel_users_select on public.hotel_users;
drop policy if exists hotel_users_manage on public.hotel_users;
drop policy if exists hotel_media_public_select on public.hotel_media;
drop policy if exists hotel_media_manage on public.hotel_media;
drop policy if exists room_types_public_select on public.room_types;
drop policy if exists room_types_manage on public.room_types;
drop policy if exists rooms_manage on public.rooms;
drop policy if exists bookings_manage on public.bookings;
drop policy if exists guests_manage on public.guests;
drop policy if exists availability_public_select on public.availability;
drop policy if exists availability_manage on public.availability;
drop policy if exists hotel_domains_public_select on public.hotel_domains;
drop policy if exists hotel_domains_manage on public.hotel_domains;
drop policy if exists ota_connections_manage on public.ota_connections;
drop policy if exists ota_sync_logs_manage on public.ota_sync_logs;

create policy ota_connections_manage on public.ota_connections
  for all
  using (public.is_hotel_member(hotel_id))
  with check (public.is_hotel_member(hotel_id));

create policy ota_sync_logs_manage on public.ota_sync_logs
  for all
  using (public.is_hotel_member(hotel_id))
  with check (public.is_hotel_member(hotel_id));

create policy hotels_select on public.hotels
  for select
  using (public.is_hotel_member(id));

-- Secure public hotel retrieval function (omits owner_contact; address is public hotel profile data)
create or replace function public.get_public_hotel(target_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  address text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select h.id, h.name, h.slug, h.address, h.created_at
  from public.hotels h
  where h.slug = target_slug
    and h.public_enabled = true;
$$;

revoke all on function public.get_public_hotel(text) from public;
grant execute on function public.get_public_hotel(text) to anon, authenticated;

create policy hotels_manage on public.hotels
  for all
  using (public.is_super_admin() or public.is_hotel_member(id))
  with check (public.is_super_admin() or public.is_hotel_member(id));

create policy hotel_users_select on public.hotel_users
  for select
  using (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy hotel_users_manage on public.hotel_users
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy hotel_media_public_select on public.hotel_media
  for select
  using (exists (
    select 1 from public.hotels h
    where h.id = hotel_id and (h.public_enabled or public.is_hotel_member(h.id))
  ));

create policy hotel_media_manage on public.hotel_media
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy room_types_public_select on public.room_types
  for select
  using (exists (
    select 1 from public.hotels h
    where h.id = hotel_id and (h.public_enabled or public.is_hotel_member(h.id))
  ));

create policy room_types_manage on public.room_types
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy rooms_manage on public.rooms
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy bookings_manage on public.bookings
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy guests_manage on public.guests
  for all
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id and (public.is_super_admin() or public.is_hotel_member(b.hotel_id))
  ))
  with check (exists (
    select 1 from public.bookings b
    where b.id = booking_id and (public.is_super_admin() or public.is_hotel_member(b.hotel_id))
  ));

create policy availability_public_select on public.availability
  for select
  using (exists (
    select 1
    from public.room_types rt
    join public.hotels h on h.id = rt.hotel_id
    where rt.id = room_type_id and (h.public_enabled or public.is_hotel_member(h.id))
  ));

create policy availability_manage on public.availability
  for all
  using (exists (
    select 1
    from public.room_types rt
    where rt.id = room_type_id and (public.is_super_admin() or public.is_hotel_member(rt.hotel_id))
  ))
  with check (exists (
    select 1
    from public.room_types rt
    where rt.id = room_type_id and (public.is_super_admin() or public.is_hotel_member(rt.hotel_id))
  ));

create policy hotel_domains_public_select on public.hotel_domains
  for select
  using (verified or public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy hotel_domains_manage on public.hotel_domains
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

-- -----------------------------------------------------------------------------
-- OTA Sync Foundation Tables & Policies
-- -----------------------------------------------------------------------------

create table if not exists public.ota_connections (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  provider varchar(50) not null,
  status varchar(20) not null default 'disconnected',
  api_key text,
  hotel_code varchar(100),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hotel_provider unique (hotel_id, provider)
);

create table if not exists public.ota_sync_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  provider varchar(50) not null,
  direction varchar(10) not null,
  action varchar(50) not null,
  status varchar(20) not null,
  payload jsonb,
  response jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.ota_connections enable row level security;
alter table public.ota_sync_logs enable row level security;

drop policy if exists ota_connections_select on public.ota_connections;
drop policy if exists ota_connections_manage on public.ota_connections;
drop policy if exists ota_sync_logs_select on public.ota_sync_logs;
drop policy if exists ota_sync_logs_manage on public.ota_sync_logs;

create policy ota_connections_select on public.ota_connections
  for select
  using (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy ota_connections_manage on public.ota_connections
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy ota_sync_logs_select on public.ota_sync_logs
  for select
  using (public.is_super_admin() or public.is_hotel_member(hotel_id));

create policy ota_sync_logs_manage on public.ota_sync_logs
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));


-- =============================================================================
-- Six-role authorization hardening (human memberships + server-only service role)
-- =============================================================================

-- Human users are stored in hotel_users. The API/service role is deliberately
-- not a human membership and is represented by service_accounts below.
alter table public.hotel_users drop constraint if exists hotel_users_role_check;
alter table public.hotel_users
  add constraint hotel_users_role_check
  check (role in ('super_admin', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping'));

create table if not exists public.service_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null default 'api_service' check (role = 'api_service'),
  hotel_id uuid references public.hotels(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_accounts_hotel_id on public.service_accounts (hotel_id);
alter table public.service_accounts enable row level security;
drop policy if exists service_accounts_deny_authenticated on public.service_accounts;
create policy service_accounts_deny_authenticated on public.service_accounts
  for all using (false) with check (false);

create table if not exists public.room_housekeeping_status (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  status text not null default 'clean' check (status in ('clean', 'dirty', 'out_of_order')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.room_housekeeping_status enable row level security;
drop policy if exists room_housekeeping_select on public.room_housekeeping_status;
drop policy if exists room_housekeeping_insert on public.room_housekeeping_status;
drop policy if exists room_housekeeping_update on public.room_housekeeping_status;
drop policy if exists room_housekeeping_delete on public.room_housekeeping_status;

create or replace function public.current_user_has_role(target_role text, target_hotel_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.hotel_users hu
    where hu.user_id = auth.uid()
      and hu.role = target_role
      and (target_hotel_id is null or hu.hotel_id = target_hotel_id)
  );
$$;

create or replace function public.can_manage_property(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id);
$$;

create or replace function public.can_manage_staff(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id);
$$;

-- Immutable property-scoped audit history for permission changes. Transfer events
-- are inserted by the SECURITY DEFINER RPC below, not by the browser client.
create table if not exists public.hotel_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  actor_user_id uuid not null,
  actor_email text,
  action text not null check (action = 'hotel_admin_transfer'),
  previous_admin_membership_id uuid not null,
  previous_admin_user_id uuid not null,
  new_admin_membership_id uuid not null,
  new_admin_user_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hotel_admin_audit_logs_hotel_created_idx
  on public.hotel_admin_audit_logs (hotel_id, created_at desc);

alter table public.hotel_admin_audit_logs enable row level security;

 drop policy if exists hotel_admin_audit_logs_select on public.hotel_admin_audit_logs;
create policy hotel_admin_audit_logs_select on public.hotel_admin_audit_logs
  for select using (
    public.is_super_admin()
    or public.current_user_has_role('hotel_owner', hotel_id)
  );

-- Transfers ownership without exposing broad table access to the client. The current
-- Hotel Admin or a Super Admin may transfer to an existing human membership in
-- the same hotel. The old owner is retained as Front Desk so the property never
-- loses a usable staff account during the handover, and the audit event is written
-- in the same transaction as the role updates.
create or replace function public.transfer_hotel_admin(target_hotel_id uuid, target_membership_id uuid)
returns table (
  id uuid,
  hotel_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  current_owner_id uuid;
  current_owner_user_id uuid;
  target_membership public.hotel_users%rowtype;
begin
  if not (public.is_super_admin() or public.current_user_has_role('hotel_owner', target_hotel_id)) then
    raise exception '42501: You do not have permission to transfer this hotel administrator.';
  end if;

  select * into target_membership
  from public.hotel_users
  where id = target_membership_id
    and hotel_id = target_hotel_id
  for update;

  if not found then
    raise exception 'P0002: The selected staff membership was not found in this hotel.';
  end if;

  if target_membership.role in ('super_admin', 'api_service') then
    raise exception '23514: Only a human hotel staff member can receive Hotel Admin access.';
  end if;

  select hu.id, hu.user_id into current_owner_id, current_owner_user_id
  from public.hotel_users hu
  where hu.hotel_id = target_hotel_id
    and hu.role = 'hotel_owner'
  for update;

  if current_owner_id is null then
    raise exception 'P0002: This hotel does not have a current Hotel Admin to transfer.';
  end if;

  if current_owner_id <> target_membership_id then
    update public.hotel_users
    set role = 'front_desk'
    where id = current_owner_id;

    update public.hotel_users
    set role = 'hotel_owner'
    where id = target_membership_id;

    insert into public.hotel_admin_audit_logs (
      hotel_id,
      actor_user_id,
      actor_email,
      action,
      previous_admin_membership_id,
      previous_admin_user_id,
      new_admin_membership_id,
      new_admin_user_id,
      details
    ) values (
      target_hotel_id,
      auth.uid(),
      auth.jwt() ->> 'email',
      'hotel_admin_transfer',
      current_owner_id,
      current_owner_user_id,
      target_membership_id,
      target_membership.user_id,
      jsonb_build_object(
        'previous_role', 'hotel_owner',
        'new_role', 'hotel_owner',
        'demoted_role', 'front_desk',
        'source', 'hotel_staff_transfer'
      )
    );
  end if;

  return query
  select hu.id, hu.hotel_id, hu.user_id, hu.role, hu.created_at
  from public.hotel_users hu
  where hu.id = target_membership_id;
end;
$$;

create or replace function public.can_manage_rates(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id)
      or public.current_user_has_role('revenue_manager', target_hotel_id);
$$;

create or replace function public.can_manage_bookings(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id)
      or public.current_user_has_role('front_desk', target_hotel_id);
$$;

create or replace function public.can_manage_housekeeping(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id)
      or public.current_user_has_role('housekeeping', target_hotel_id);
$$;

create or replace function public.can_manage_ical(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.is_super_admin()
      or public.current_user_has_role('hotel_owner', target_hotel_id);
$$;

revoke all on function public.current_user_has_role(text, uuid) from public;
revoke all on function public.can_manage_property(uuid) from public;
revoke all on function public.can_manage_staff(uuid) from public;
revoke all on function public.transfer_hotel_admin(uuid, uuid) from public;
revoke all on table public.hotel_admin_audit_logs from anon, authenticated;
grant select on table public.hotel_admin_audit_logs to authenticated;
revoke all on function public.can_manage_rates(uuid) from public;
revoke all on function public.can_manage_bookings(uuid) from public;
revoke all on function public.can_manage_housekeeping(uuid) from public;
revoke all on function public.can_manage_ical(uuid) from public;
grant execute on function public.current_user_has_role(text, uuid) to anon, authenticated;
grant execute on function public.can_manage_property(uuid) to anon, authenticated;
grant execute on function public.can_manage_staff(uuid) to anon, authenticated;
grant execute on function public.transfer_hotel_admin(uuid, uuid) to authenticated;
grant execute on function public.can_manage_rates(uuid) to anon, authenticated;
grant execute on function public.can_manage_bookings(uuid) to anon, authenticated;
grant execute on function public.can_manage_housekeeping(uuid) to anon, authenticated;
grant execute on function public.can_manage_ical(uuid) to anon, authenticated;

-- Replace broad property-member write policies with capability-specific policies.
drop policy if exists hotels_manage on public.hotels;
drop policy if exists hotel_users_manage on public.hotel_users;
drop policy if exists hotel_media_manage on public.hotel_media;
drop policy if exists room_types_manage on public.room_types;
drop policy if exists rooms_manage on public.rooms;
drop policy if exists bookings_manage on public.bookings;
drop policy if exists guests_manage on public.guests;
drop policy if exists availability_manage on public.availability;
drop policy if exists hotel_domains_manage on public.hotel_domains;
drop policy if exists ota_connections_manage on public.ota_connections;
drop policy if exists ota_sync_logs_manage on public.ota_sync_logs;
drop policy if exists ota_connections_select on public.ota_connections;
drop policy if exists ota_sync_logs_select on public.ota_sync_logs;

drop policy if exists hotels_insert_platform on public.hotels;
drop policy if exists hotels_update_property on public.hotels;
drop policy if exists hotels_delete_platform on public.hotels;
create policy hotels_insert_platform on public.hotels for insert
  with check (public.is_super_admin());
create policy hotels_update_property on public.hotels for update
  using (public.can_manage_property(id)) with check (public.can_manage_property(id));
create policy hotels_delete_platform on public.hotels for delete
  using (public.is_super_admin());

create policy hotel_users_manage_scoped on public.hotel_users for all
  using (public.is_super_admin() or public.can_manage_staff(hotel_id))
  with check (
    (public.is_super_admin())
    or (public.can_manage_staff(hotel_id) and role <> 'super_admin')
  );

create policy hotel_media_manage_scoped on public.hotel_media for all
  using (public.can_manage_property(hotel_id))
  with check (public.can_manage_property(hotel_id));

create policy room_types_manage_scoped on public.room_types for all
  using (public.can_manage_property(hotel_id))
  with check (public.can_manage_property(hotel_id));

create policy rooms_manage_scoped on public.rooms for all
  using (public.can_manage_property(hotel_id))
  with check (public.can_manage_property(hotel_id));

-- Bookings and guests are operational data: Front Desk may create/update but
-- cannot delete; owners and platform admins retain full lifecycle control.
drop policy if exists bookings_select_scoped on public.bookings;
drop policy if exists bookings_insert_operational on public.bookings;
drop policy if exists bookings_update_operational on public.bookings;
drop policy if exists bookings_delete_owner on public.bookings;
create policy bookings_select_scoped on public.bookings for select
  using (public.is_hotel_member(hotel_id));
create policy bookings_insert_operational on public.bookings for insert
  with check (public.can_manage_bookings(hotel_id));
create policy bookings_update_operational on public.bookings for update
  using (public.can_manage_bookings(hotel_id)) with check (public.can_manage_bookings(hotel_id));
create policy bookings_delete_owner on public.bookings for delete
  using (public.can_manage_property(hotel_id));

drop policy if exists guests_select_scoped on public.guests;
drop policy if exists guests_insert_operational on public.guests;
drop policy if exists guests_update_operational on public.guests;
drop policy if exists guests_delete_owner on public.guests;
create policy guests_select_scoped on public.guests for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.is_hotel_member(b.hotel_id)));
create policy guests_insert_operational on public.guests for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)));
create policy guests_update_operational on public.guests for update
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)))
  with check (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)));
create policy guests_delete_owner on public.guests for delete
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_property(b.hotel_id)));

-- Revenue and availability writes are separated from front-desk booking work.
drop policy if exists availability_select_scoped on public.availability;
drop policy if exists availability_write_revenue on public.availability;
create policy availability_select_scoped on public.availability for select
  using (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.is_hotel_member(rt.hotel_id)));
create policy availability_write_revenue on public.availability for all
  using (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)))
  with check (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)));

create policy hotel_domains_manage_scoped on public.hotel_domains for all
  using (public.can_manage_property(hotel_id)) with check (public.can_manage_property(hotel_id));

create policy ota_connections_select_scoped on public.ota_connections for select
  using (public.is_hotel_member(hotel_id));
create policy ota_connections_manage_scoped on public.ota_connections for all
  using (public.can_manage_ical(hotel_id)) with check (public.can_manage_ical(hotel_id));
create policy ota_sync_logs_select_scoped on public.ota_sync_logs for select
  using (public.is_hotel_member(hotel_id));
create policy ota_sync_logs_insert_scoped on public.ota_sync_logs for insert
  with check (public.can_manage_ical(hotel_id));

create policy room_housekeeping_select on public.room_housekeeping_status for select
  using (exists (select 1 from public.rooms r where r.id = room_id and public.is_hotel_member(r.hotel_id)));
create policy room_housekeeping_insert on public.room_housekeeping_status for insert
  with check (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)));
create policy room_housekeeping_update on public.room_housekeeping_status for update
  using (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)))
  with check (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)));
create policy room_housekeeping_delete on public.room_housekeeping_status for delete
  using (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_property(r.hotel_id)));

create policy rooms_select_scoped on public.rooms for select
  using (public.is_hotel_member(hotel_id));
