-- =====================================================================
-- 20261027_rls_write_hardening.sql  (spec 14, ticket 14-00)
-- Security hotfix. Run in the Supabase SQL editor, then run
-- verify_20261027_rls_write_hardening.sql (every row must read PASS).
--
-- Closes two holes found in the spec 14 RLS inventory:
--   1. A hotel owner could insert or update a hotel_users row with role 'admin'
--      (only 'super_admin' was blocked), and is_platform_admin() then opens every
--      hotel's bookings, guests and passport data to that account. An owner could
--      also delete a platform account's anchor row that points at their hotel.
--   2. Several write policies used is_hotel_member(), so any member (housekeeping
--      included) and the read-only platform admin could write directly through
--      PostgREST: payment settings (PromptPay ID = where guest money goes),
--      payment sessions, booking services, rate overrides, housekeeping tasks,
--      message threads/messages and the service catalog.
--
-- Each write now uses the same can_manage_* helper that matches the permission
-- the application already requires. SELECT policies are unchanged. No data changes.
-- =====================================================================

begin;

-- 1. Hotel staff management can never touch platform roles -----------------------
drop policy if exists hotel_users_manage_scoped on public.hotel_users;
create policy hotel_users_manage_scoped on public.hotel_users for all
  using (
    public.is_super_admin()
    or (public.can_manage_staff(hotel_id) and role not in ('super_admin', 'admin', 'support'))
  )
  with check (
    public.is_super_admin()
    or (public.can_manage_staff(hotel_id) and role not in ('super_admin', 'admin', 'support'))
  );

-- 2a. Payment settings: owner (property.manage_profile) only --------------------
drop policy if exists "hotel_payment_settings_upsert" on public.hotel_payment_settings;
drop policy if exists "hotel_payment_settings_update" on public.hotel_payment_settings;
create policy "hotel_payment_settings_upsert" on public.hotel_payment_settings for insert
  with check (public.can_manage_property(hotel_id));
create policy "hotel_payment_settings_update" on public.hotel_payment_settings for update
  using (public.can_manage_property(hotel_id))
  with check (public.can_manage_property(hotel_id));

-- 2b. Payment sessions: staff who manage bookings (manual verify); guests go
--     through the server's service-role client, which RLS does not affect.
drop policy if exists "payment_sessions_insert" on public.payment_sessions;
drop policy if exists "payment_sessions_update" on public.payment_sessions;
create policy "payment_sessions_insert" on public.payment_sessions for insert
  with check (public.can_manage_bookings(hotel_id));
create policy "payment_sessions_update" on public.payment_sessions for update
  using (public.can_manage_bookings(hotel_id))
  with check (public.can_manage_bookings(hotel_id));

-- 2c. Booking services: members read, booking managers write ------------------
drop policy if exists "Users can view and manage services for bookings in their hotels" on public.booking_services;
drop policy if exists booking_services_select on public.booking_services;
drop policy if exists booking_services_insert on public.booking_services;
drop policy if exists booking_services_update on public.booking_services;
drop policy if exists booking_services_delete on public.booking_services;
create policy booking_services_select on public.booking_services for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.is_hotel_member(b.hotel_id)));
create policy booking_services_insert on public.booking_services for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)));
create policy booking_services_update on public.booking_services for update
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)))
  with check (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)));
create policy booking_services_delete on public.booking_services for delete
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.can_manage_bookings(b.hotel_id)));

-- 2d. Rate overrides: revenue managers (revenue.manage_pricing_rules) ------------
drop policy if exists rate_overrides_manage on public.rate_overrides;
drop policy if exists rate_overrides_insert on public.rate_overrides;
drop policy if exists rate_overrides_update on public.rate_overrides;
drop policy if exists rate_overrides_delete on public.rate_overrides;
create policy rate_overrides_insert on public.rate_overrides for insert
  with check (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)));
create policy rate_overrides_update on public.rate_overrides for update
  using (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)))
  with check (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)));
create policy rate_overrides_delete on public.rate_overrides for delete
  using (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_manage_rates(rt.hotel_id)));

-- 2e. Housekeeping tasks: housekeeping.update_room_status -------------------------
drop policy if exists housekeeping_tasks_manage on public.housekeeping_tasks;
drop policy if exists housekeeping_tasks_insert on public.housekeeping_tasks;
drop policy if exists housekeeping_tasks_update on public.housekeeping_tasks;
drop policy if exists housekeeping_tasks_delete on public.housekeeping_tasks;
create policy housekeeping_tasks_insert on public.housekeeping_tasks for insert
  with check (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)));
create policy housekeeping_tasks_update on public.housekeeping_tasks for update
  using (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)))
  with check (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_housekeeping(r.hotel_id)));
create policy housekeeping_tasks_delete on public.housekeeping_tasks for delete
  using (exists (select 1 from public.rooms r where r.id = room_id and public.can_manage_property(r.hotel_id)));

-- 2f. Message threads and messages: operations.manage_bookings -------------------
drop policy if exists message_threads_manage on public.message_threads;
drop policy if exists message_threads_insert on public.message_threads;
drop policy if exists message_threads_update on public.message_threads;
drop policy if exists message_threads_delete on public.message_threads;
create policy message_threads_insert on public.message_threads for insert
  with check (public.can_manage_bookings(hotel_id));
create policy message_threads_update on public.message_threads for update
  using (public.can_manage_bookings(hotel_id))
  with check (public.can_manage_bookings(hotel_id));
create policy message_threads_delete on public.message_threads for delete
  using (public.can_manage_property(hotel_id));

drop policy if exists messages_manage on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;
create policy messages_insert on public.messages for insert
  with check (exists (select 1 from public.message_threads mt where mt.id = thread_id and public.can_manage_bookings(mt.hotel_id)));
create policy messages_update on public.messages for update
  using (exists (select 1 from public.message_threads mt where mt.id = thread_id and public.can_manage_bookings(mt.hotel_id)))
  with check (exists (select 1 from public.message_threads mt where mt.id = thread_id and public.can_manage_bookings(mt.hotel_id)));
create policy messages_delete on public.messages for delete
  using (exists (select 1 from public.message_threads mt where mt.id = thread_id and public.can_manage_property(mt.hotel_id)));

-- 2g. Hotel service catalog: members read (incl. inactive), owner writes ---------
drop policy if exists "hotel_services_manage" on public.hotel_services;
drop policy if exists hotel_services_member_select on public.hotel_services;
drop policy if exists hotel_services_insert on public.hotel_services;
drop policy if exists hotel_services_update on public.hotel_services;
drop policy if exists hotel_services_delete on public.hotel_services;
create policy hotel_services_member_select on public.hotel_services for select
  using (public.is_super_admin() or public.is_hotel_member(hotel_id));
create policy hotel_services_insert on public.hotel_services for insert
  with check (public.can_manage_property(hotel_id));
create policy hotel_services_update on public.hotel_services for update
  using (public.can_manage_property(hotel_id))
  with check (public.can_manage_property(hotel_id));
create policy hotel_services_delete on public.hotel_services for delete
  using (public.can_manage_property(hotel_id));

commit;

-- =====================================================================
-- Rollback (restores the previous, weaker policies; only if this breaks a flow):
--   re-run the policy blocks of supabase_migration_production.sql:752-757,
--   20260904_add_hotel_payment_settings.sql, 20260908_add_payment_flow.sql,
--   20260907_add_booking_services.sql, 20260831_add_rate_overrides.sql,
--   20260901_add_housekeeping_tasks.sql, 20260902_add_message_threads.sql and
--   20260911_add_hotel_services_catalog.sql after dropping the policies above.
-- =====================================================================
