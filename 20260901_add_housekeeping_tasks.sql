-- =====================================================================
-- Migration: housekeeping_tasks (room cleaning/maintenance task queue)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   Supports the housekeeping operations queue. Each task is bound to a
--   room (required) and optionally to a booking + assignee. due_date
--   defaults in application code to the booking's check_out when a
--   booking_id is provided without an explicit due_date. Status is
--   constrained to pending / in_progress / done.
--
--   RLS is row-scoped through rooms.hotel_id via is_hotel_member().
--   Application procedures are gated by housekeeping.view_room_status
--   (list) and housekeeping.update_room_status (create/update).
-- =====================================================================

begin;

create table if not exists public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

-- Indexes for filtering by room and due date scans
create index if not exists idx_housekeeping_tasks_room_id
  on public.housekeeping_tasks (room_id);
create index if not exists idx_housekeeping_tasks_due_date
  on public.housekeeping_tasks (due_date);

alter table public.housekeeping_tasks enable row level security;

drop policy if exists housekeeping_tasks_select on public.housekeeping_tasks;
drop policy if exists housekeeping_tasks_manage on public.housekeeping_tasks;

-- Select: members of the room's hotel (or super_admin) can read tasks.
create policy housekeeping_tasks_select on public.housekeeping_tasks
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (public.is_super_admin() or public.is_hotel_member(r.hotel_id))
    )
  );

-- All (insert/update/delete): same membership gate; write additionally
-- enforced in the application layer via requireHotelPermission(...,
-- 'housekeeping.view_room_status' / 'housekeeping.update_room_status').
create policy housekeeping_tasks_manage on public.housekeeping_tasks
  for all
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (public.is_super_admin() or public.is_hotel_member(r.hotel_id))
    )
  )
  with check (
    exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and (public.is_super_admin() or public.is_hotel_member(r.hotel_id))
    )
  );

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   drop table if exists public.housekeeping_tasks;
--   commit;
-- =====================================================================
