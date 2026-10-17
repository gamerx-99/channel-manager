-- P0 SECURITY FIX: block hotel_owner -> platform-admin privilege escalation.
-- Additive only; human applies in Supabase SQL editor (agent never runs live SQL).
-- Verify with: verify_20261017_hotel_users_role_escalation_guard.sql
--
-- WHY THIS EXISTS
-- ---------------
-- `hotel_users_manage_scoped` (supabase_migration_production.sql:752) gated writes as:
--
--   using    (is_super_admin() or can_manage_staff(hotel_id))
--   with check (is_super_admin() or (can_manage_staff(hotel_id) and role <> 'super_admin'))
--
-- `can_manage_staff(h)` is true for any hotel_owner of h, and the WITH CHECK only
-- excluded 'super_admin'. The 'admin' role was added to the CHECK allow-list by
-- migration 20260824, and `is_platform_admin()` = role in ('super_admin','admin')
-- short-circuits `is_hotel_member()` (20260824:45-80). Together that means a
-- hotel_owner could self-grant platform admin with one direct PostgREST write
-- (the anon key is public in client source), then read every tenant's bookings,
-- guests (passport_no / birth_date) and hotel_payment_settings (slipok_key_enc)
-- via the membership-scoped SELECT policies.
--
-- The application layer was already safe — `hotelStaffRoleValueSchema`
-- (server/routers/staffRouter.ts:61) offers only the four hotel-scoped roles, and
-- the procedures that may assign a platform role (`inviteAdminUser`,
-- `assignAdminUser`) additionally call `requireSuperAdmin`. This migration makes
-- the database agree with the application instead of relying on it.
--
-- SCOPE
-- -----
-- Tightens ONE policy on ONE table. No role is removed from the CHECK allow-list,
-- so super_admin keeps full membership management and no existing assignment
-- becomes invalid. Re-running is safe: every step is DROP ... IF EXISTS first.

-- 1) Role gate on membership writes -----------------------------------------
-- Non-super-admins may only create/keep the four hotel-scoped roles. 'admin' and
-- 'super_admin' are reachable ONLY through the is_super_admin() branch, which a
-- tenant can never satisfy.
begin;

drop policy if exists hotel_users_manage_scoped on public.hotel_users;

create policy hotel_users_manage_scoped on public.hotel_users for all
  using (public.is_super_admin() or public.can_manage_staff(hotel_id))
  with check (
    (public.is_super_admin())
    or (
      public.can_manage_staff(hotel_id)
      and role in ('hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping')
    )
  );

commit;

-- 2) Defence in depth: the anon role never writes memberships.
-- Anonymous callers are guests of the public booking flow and have no legitimate
-- reason to touch hotel_users. service_role is unaffected (it bypasses RLS).
revoke insert, update, delete on table public.hotel_users from anon;

-- 3) Keep the anon grantlist honest if a future migration re-grants it.
alter table public.hotel_users enable row level security;

comment on policy hotel_users_manage_scoped on public.hotel_users is
  'B1-era hardening: hotel-scoped roles only for tenant users. "admin"/"super_admin" require is_super_admin(), matching hotelStaffRoleValueSchema in server/routers/staffRouter.ts. See 20261017_hotel_users_role_escalation_guard.sql.';