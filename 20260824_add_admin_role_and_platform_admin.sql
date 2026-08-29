-- =====================================================================
-- Migration: add 'admin' (platform operations admin) role
-- Scope: Part 1 — Database only (constraint + RLS gatekeeper functions)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context (verified against live production schema on 2026-08-23):
--   * Roles live ONLY in public.hotel_users.role (text, NOT NULL, CHECK).
--     hotel_id is NOT NULL, FK -> public.hotels(id).
--   * Existing allowed roles:
--       super_admin, hotel_owner, revenue_manager, front_desk, housekeeping
--   * is_super_admin()  = EXISTS hotel_users row (any hotel) with role='super_admin'
--   * is_hotel_member(h)= is_super_admin() OR EXISTS row for that hotel
--
-- This migration:
--   1. Adds 'admin' to the hotel_users_role_check allow-list.
--   2. Adds is_platform_admin() = role in ('super_admin','admin').
--   3. Rewrites is_hotel_member() to short-circuit on is_platform_admin(),
--      so 'admin' can SELECT every hotel's data at the RLS layer, exactly
--      like super_admin — WITHOUT touching the write/can_manage_* functions
--      (admin write scoping is enforced in the app / tRPC layer).
--
-- NOTE: 'admin' is a PLATFORM-level role. Like super_admin, its hotel_users
-- row still needs a hotel_id (column is NOT NULL); the platform checks ignore
-- which hotel the row points at.
-- =====================================================================

begin;

-- 1) Extend the role CHECK constraint --------------------------------------
alter table public.hotel_users
  drop constraint if exists hotel_users_role_check;

alter table public.hotel_users
  add constraint hotel_users_role_check
  check (role in (
    'super_admin',
    'admin',
    'hotel_owner',
    'revenue_manager',
    'front_desk',
    'housekeeping'
  ));

-- 2) New gatekeeper: platform admin (super_admin OR admin) ------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
  select exists (
    select 1
    from public.hotel_users hu
    where hu.user_id = auth.uid()
      and hu.role in ('super_admin', 'admin')
  );
$function$;

grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

-- 3) Let 'admin' read every hotel at the RLS layer -------------------------
--    (identical to the original, with is_super_admin() -> is_platform_admin())
create or replace function public.is_hotel_member(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.hotel_users hu
    where hu.user_id = auth.uid()
      and hu.hotel_id = target_hotel_id
  );
$function$;

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   alter table public.hotel_users drop constraint if exists hotel_users_role_check;
--   alter table public.hotel_users add constraint hotel_users_role_check
--     check (role in ('super_admin','hotel_owner','revenue_manager','front_desk','housekeeping'));
--   create or replace function public.is_hotel_member(target_hotel_id uuid)
--   returns boolean language sql stable security definer
--   set search_path to 'public','pg_temp' set row_security to 'off'
--   as $$
--     select public.is_super_admin()
--     or exists (select 1 from public.hotel_users hu
--                where hu.user_id = auth.uid() and hu.hotel_id = target_hotel_id);
--   $$;
--   drop function if exists public.is_platform_admin();
--   commit;
-- =====================================================================
