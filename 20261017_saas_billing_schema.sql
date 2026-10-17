-- SaaS shell: subscription plans + per-hotel subscription + hotel lifecycle.
-- Additive only; human applies in Supabase SQL editor (agent never runs live SQL).
-- Verify with: verify_20261017_saas_billing_schema.sql
--
-- PRODUCT DECISIONS (owner-confirmed 2026-10-17)
--   * Trial first, then tiered pricing by room count.
--   * On non-payment: block NEW bookings, keep existing data readable and
--     check-in/check-out working (ร.ร.4 / ตม.30 obligations continue).
--
-- RLS DESIGN NOTE
--   Every table added to this repo AFTER supabase_migration_production.sql
--   regressed to `is_hotel_member(hotel_id)` on writes, which lets the lowest
--   role (housekeeping) rewrite rate overrides, payment settings and OTA blocks
--   through PostgREST. This migration uses capability predicates from the start:
--     property.manage_profile  -> hotel_owner (super_admin passes everything)
--     platform.*               -> is_super_admin() only
--   Platform roles are NOT allowed to write: `admin` is cross-hotel read-only by
--   design (shared/authorization.ts:96-104).
--
-- ASSUMPTION: plan prices below are placeholders pending owner confirmation.
-- Re-run is safe: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS throughout.

begin;

-- 1. Hotel lifecycle (soft) -----------------------------------------------
-- Suspension is enforced in the app layer (server/billing/subscriptionAccess.ts)
-- and by hotel_is_active() below; nothing here deletes a hotel row.
alter table public.hotels
  add column if not exists suspended_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

comment on column public.hotels.suspended_at is
  'Set when the platform suspends a tenant. Blocks new bookings via hotel_is_active(); existing bookings stay readable for check-in/check-out and statutory reporting.';
comment on column public.hotels.deleted_at is
  'Soft delete marker. Rows are retained: ร.ร.4 guest data must be kept at least 1 year and bookings reference this hotel.';

-- 2. Plan catalogue ------------------------------------------------------
-- Tiered by physical room count, not room_type count: a hotel may have 3 room
-- types and 40 physical rooms.
create table if not exists public.plans (
  code text primary key,
  max_rooms integer not null check (max_rooms > 0),
  price_monthly numeric(12,2) not null check (price_monthly >= 0),
  price_yearly numeric(12,2) not null check (price_yearly >= 0),
  name_th text not null,
  name_en text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.plans is
  'Subscription tiers, selected by physical room count. ASSUMPTION: prices are placeholders pending owner confirmation.';

insert into public.plans (code, max_rooms, price_monthly, price_yearly, name_th, name_en, sort_order) values
  ('starter', 8, 990.00, 9900.00, 'เริ่มต้น (ไม่เกิน 8 ห้อง)', 'Starter (up to 8 rooms)', 1),
  ('standard', 25, 1990.00, 19900.00, 'มาตรฐาน (ไม่เกิน 25 ห้อง)', 'Standard (up to 25 rooms)', 2),
  ('pro', 2147483647, 3990.00, 39900.00, 'โปร (ไม่จำกัดห้อง)', 'Pro (unlimited rooms)', 3)
on conflict (code) do update set
  max_rooms = excluded.max_rooms,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  name_th = excluded.name_th,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order;

alter table public.plans enable row level security;

-- Public: the pricing page must read plans without a session.
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans for select
  using (true);

revoke insert, update, delete on table public.plans from anon, authenticated;

-- 3. Subscriptions -------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'trialing' check (status in
    ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  -- Room count at purchase time. A hotel that grows past its tier must renew at
  -- the new tier rather than silently keeping the old one.
  tier_rooms integer not null check (tier_rooms > 0),
  price_paid numeric(12,2) not null check (price_paid >= 0),
  trial_ends_at timestamptz,
  period_start timestamptz,
  period_end timestamptz not null,
  source text check (source in ('promptpay', 'slipok', 'manual')),
  reference text,
  verified_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tier_rooms must fit inside the purchased plan's ceiling. A CHECK constraint
-- cannot reference another table, so this is a trigger (see section 3b).

comment on table public.subscriptions is
  'One live subscription per hotel. Payment lands in the platform account (PromptPay/SlipOK), never in the hotel''s.';

create index if not exists subscriptions_hotel_idx on public.subscriptions (hotel_id);
-- At most one live subscription (trialing/active/past_due) per hotel.
create unique index if not exists subscriptions_one_live_per_hotel
  on public.subscriptions (hotel_id)
  where status in ('trialing', 'active', 'past_due');

alter table public.subscriptions enable row level security;

-- Owner reads their own subscription to render the paywall state; platform
-- reads everything. No write path for tenants: payment verification is a
-- platform operation via the service-role client.
drop policy if exists subscriptions_select_scoped on public.subscriptions;
create policy subscriptions_select_scoped on public.subscriptions for select
  using (public.is_super_admin() or public.can_manage_property(hotel_id));

drop policy if exists subscriptions_platform_write on public.subscriptions;
create policy subscriptions_platform_write on public.subscriptions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke insert, update, delete on table public.subscriptions from anon;

-- 3b. Tier ceiling enforcement -------------------------------------------
-- A subscription row must not claim more rooms than its plan allows. The FK
-- keeps plan_code valid; this trigger keeps tier_rooms honest.
create or replace function public.assert_subscription_tier_fits()
returns trigger language plpgsql as $$
declare
  plan_max integer;
begin
  select max_rooms into plan_max from public.plans where code = NEW.plan_code;
  if plan_max is null then
    raise exception 'Unknown plan code: %', NEW.plan_code using errcode = '23503';
  end if;
  if NEW.tier_rooms > plan_max then
    raise exception 'tier_rooms % exceeds plan % ceiling %',
      NEW.tier_rooms, NEW.plan_code, plan_max using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists subscriptions_tier_fits on public.subscriptions;
create trigger subscriptions_tier_fits
  before insert or update of plan_code, tier_rooms on public.subscriptions
  for each row execute function public.assert_subscription_tier_fits();

-- 4. Lifecycle helper ----------------------------------------------------
-- Single definition of "may this hotel take new work". Mirrors
-- server/billing/subscriptionAccess.ts; the app layer is authoritative and
-- this is the RLS/DB-level backstop.
create or replace function public.hotel_is_active(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.hotels h
    where h.id = target_hotel_id
      and h.suspended_at is null
      and h.deleted_at is null
      and h.public_enabled
      and (
        exists (
          select 1
          from public.subscriptions s
          where s.hotel_id = h.id
            and s.status in ('trialing', 'active')
            and s.period_end > now()
        )
        or public.is_super_admin()
      )
  );
$$;

revoke all on function public.hotel_is_active(uuid) from public;
grant execute on function public.hotel_is_active(uuid) to anon, authenticated, service_role;

-- 5. updated_at trigger for subscriptions --------------------------------
create or replace function public.update_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_subscriptions_updated_at();

commit;

-- ===========================================================================
-- NOT INCLUDED ON PURPOSE
--   * No column changes to `hotels.public_enabled`: it is the "publish my site"
--     switch and stays under owner control. Billing suspension is separate.
--   * No DROP/DELETE anywhere — ร.ร.4 requires ≥1 year of guest records.
--   * No automatic past_due sweep: that is a cron/Vercel function, its own ticket.
-- ===========================================================================