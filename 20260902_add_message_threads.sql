-- =====================================================================
-- Migration: message_threads + messages (per-booking messaging threads)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   In-app messaging is scoped per hotel via message_threads.hotel_id.
--   Each thread is optionally linked to a booking (nullable FK) so the
--   UI can show a per-booking thread in Bookings.tsx. Messages belong to
--   exactly one thread. sender_user_id is nullable (null = system/
--   templated message) and carries no FK so service/system senders do
--   not require an auth.users row.
--
--   RLS is row-scoped through message_threads.hotel_id via
--   is_hotel_member(). Application procedures are gated by
--   operations.view_bookings (list) and operations.manage_bookings
--   (send), with an additional FORBIDDEN if the thread/booking's
--   hotel_id falls outside the caller's hotel scope.
-- =====================================================================

begin;

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

-- Indexes for filtering by hotel and thread scans
create index if not exists idx_message_threads_hotel_id
  on public.message_threads (hotel_id);
create index if not exists idx_messages_thread_id
  on public.messages (thread_id);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

drop policy if exists message_threads_select on public.message_threads;
drop policy if exists message_threads_manage on public.message_threads;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_manage on public.messages;

-- Select: members of the thread's hotel (or super_admin) can read threads.
create policy message_threads_select on public.message_threads
  for select
  using (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  );

-- All (insert/update/delete): same membership gate; write additionally
-- enforced in the application layer via requireHotelPermission(...,
-- 'operations.view_bookings' / 'operations.manage_bookings') and a
-- FORBIDDEN when the booking's hotel_id is outside the caller's scope.
create policy message_threads_manage on public.message_threads
  for all
  using (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  )
  with check (
    public.is_super_admin() or public.is_hotel_member(hotel_id)
  );

-- Select: members of the parent thread's hotel (or super_admin) can read messages.
create policy messages_select on public.messages
  for select
  using (
    exists (
      select 1
      from public.message_threads mt
      where mt.id = thread_id
        and (public.is_super_admin() or public.is_hotel_member(mt.hotel_id))
    )
  );

-- All (insert/update/delete): same membership gate via the parent thread.
create policy messages_manage on public.messages
  for all
  using (
    exists (
      select 1
      from public.message_threads mt
      where mt.id = thread_id
        and (public.is_super_admin() or public.is_hotel_member(mt.hotel_id))
    )
  )
  with check (
    exists (
      select 1
      from public.message_threads mt
      where mt.id = thread_id
        and (public.is_super_admin() or public.is_hotel_member(mt.hotel_id))
    )
  );

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   drop table if exists public.messages;
--   drop table if exists public.message_threads;
--   commit;
-- =====================================================================
