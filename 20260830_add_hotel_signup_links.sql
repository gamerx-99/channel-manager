-- =====================================================================
-- Migration: hotel_signup_links (single-use, time-limited hotel-owner
-- self-service signup links)
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   Onboarding a new hotel's owner previously required an admin to invite
--   them by email in advance (auth.admin.inviteUserByEmail). This adds a
--   lighter flow: a super_admin creates a hotel, then generates a
--   single-use, time-limited link scoped to that hotel. Anyone who opens
--   the link (before it's used or expires) can create their own login and
--   is bound as `hotel_owner` of exactly that hotel.
--
--   This table is intentionally never granted to anon/authenticated at the
--   RLS layer. Every read/write goes through the service-role admin client
--   from tRPC procedures (server/routers.ts createSignupLink/listSignupLinks/
--   validateSignupLink/completeHotelOwnerSignup), the same pattern
--   server/supabase.ts already uses for auth.admin.* calls. RLS enabled +
--   zero policies means anon/authenticated get nothing; service_role always
--   bypasses RLS.
-- =====================================================================

begin;

create table if not exists public.hotel_signup_links (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  token text not null unique,
  created_by uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists hotel_signup_links_token_idx
  on public.hotel_signup_links (token);

create index if not exists hotel_signup_links_hotel_idx
  on public.hotel_signup_links (hotel_id);

alter table public.hotel_signup_links enable row level security;

revoke all on table public.hotel_signup_links from anon, authenticated;

commit;

-- =====================================================================
-- Rollback (if needed):
--   begin;
--   drop table if exists public.hotel_signup_links;
--   commit;
-- =====================================================================
