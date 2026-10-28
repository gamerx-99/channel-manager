# 13 Move the whole platform to Cloudflare (Workers + D1 + R2), before launch
Status: IN PROGRESS — 13-01, 13-02, 13-02b, and 13-03 are implemented locally. 13-04 service
porting is in progress; the owner confirmed new D1 modules while live Supabase callers remain
unchanged until 13-07/13-08.
13-01 staging deployment remains pending. Approved direction (human, 2026-10-26), blocked only on
the questions below for the tickets that need them. Owner: A (cross-cutting; B coordinates per
`.agent/WORK_SPLIT.md`).
Depends on: — (supersedes the hosting/Supabase assumptions in `CLAUDE.md` once complete)
Owner-tier: worker-code

## Why now
Running cost target: about **US$5/month** (Workers Paid) instead of Supabase Pro $25 + Vercel Pro $20.
The human chose to rebuild the foundation **before** the first paying hotel: today the only live
data is the human's own property, no third-party OTA holds our export URLs, and no customer
depends on uptime. Every month after launch makes this migration more expensive and riskier.

## Target architecture
| Concern | Today | Target |
|---|---|---|
| Web + API | Vercel serverless, Express + tRPC (`api/index.ts` → `dist/index.js`) | **One Worker**: Hono router + tRPC fetch adapter; client served by Workers Static Assets |
| Database | Supabase Postgres, 24 migrations, 32 SQL functions, 83 RLS policies | **D1** (SQLite) via **Drizzle ORM** (already a dependency), schema in TS, `wrangler d1 migrations` |
| Authorization | RLS + `SECURITY DEFINER` functions + app permission checks | App layer only: permission checks (unchanged `shared/authorization.ts`) + a **hotel-scoped data layer** that makes cross-hotel queries impossible to write by accident |
| Double-booking guard | Postgres `EXCLUDE USING gist` | Atomic `INSERT … SELECT … WHERE NOT EXISTS (overlapping active booking)` + `changes() = 1` check (SQLite serializes writes) |
| Auth (login, MFA TOTP, invites, signup links) | Supabase Auth (`auth.mfa` used in 28 places) | **Better Auth** on D1 (email+password, TOTP 2FA plugin, admin invites) |
| Files | Supabase Storage (planned) / Forge `storagePut` (broken) | **R2** bucket binding, per-hotel key prefix |
| Scheduled jobs | Supabase pg_cron → `/api/cron/*` | **Workers Cron Triggers** (`scheduled()` handler) — no HTTP cron endpoint, no shared secret |
| Secrets | Vercel env + Supabase Vault | `wrangler secret` |
| Domain | `channel-manager-seven-blue.vercel.app` | Cloudflare Registrar domain (e.g. `hayhostth.com`) on the Worker |

Cost check (to re-verify against Cloudflare's price page at ticket time): Workers Paid $5/mo
includes Workers requests, D1 (storage + reads/writes with generous monthly allowances, Time
Travel point-in-time restore), Cron Triggers; R2 has a free tier (10 GB). Email sending is the one
external piece (see Q1).

## Non-goals
- New product features during the migration (feature freeze for A; B limited to UI-only work)
- Multi-region / read replicas
- Keeping Supabase as a fallback after cutover (decommission it once verified)

## Blocking questions — NEEDS HUMAN DECISION
1. **Transactional email provider** (staff invites, password reset, MFA recovery, booking
   confirmations): Resend free tier vs Cloudflare's own email sending. Default: Resend free tier.
2. **Existing users**: re-invite them to set a new password (simplest; there are few users
   pre-launch) vs carry over Supabase bcrypt hashes. Default: re-invite.
3. **Launch domain**: register now (e.g. `hayhostth.com`) so the cutover lands on the final domain
   and OTA export URLs are created once. Default: yes, before ticket 13-08.
4. **Cloudflare account**: which account owns the Worker, D1, R2 and the domain (one account
   for all). Needed before ticket 13-01.

## Hard invariants (must hold after every ticket)
- No query can read or write another hotel's rows unless the caller has a platform permission:
  enforced by the scoped data layer + a tenancy test suite (replaces RLS as the safety net).
- Two overlapping active bookings on one room can never both be stored, including under
  concurrent requests (integration test with real D1 in `@cloudflare/vitest-pool-workers`).
- `property.view_financials` stays hotel_owner-only; super_admin bypass rules unchanged.
- iCal export never contains guest data; cron sync stays idempotent.

## Ticket plan (each = one concern = one commit, in this order)
- [x] **13-01 Scaffold** (2026-10-27, staging deploy pending `wrangler login`): `wrangler.toml`, Worker entry (Hono + tRPC fetch adapter + static
  assets), local dev via `wrangler dev`, staging + production environments, D1 + R2 bindings,
  CI-able `pnpm build`. App still talks to Supabase at this point (Hyperdrive or supabase-js over
  fetch) so the Worker can serve the current app end-to-end on a preview URL.
- [x] **13-02 Schema** (2026-10-27, `agent-c/d1-schema`): Drizzle SQLite schema for all
  26 app-owned tables in the root migration end state plus `support_access_grants` and
  `support_access_log`; `hotel_users` includes `support`, `permission_grants`, and
  `permission_revokes`. Generated D1 migration under `drizzle/d1`; parity test checks the
  Postgres application-table snapshot against D1. Supabase-internal tables are excluded.
- [x] **13-02b Schema additions** (2026-10-28, `agent-c/d1-schema`): hotel acquisition source,
  referral hotel and agent links, `agents`, and public-booking marketing consent. Added as a new
  D1 migration; initial migration remains unchanged.
- [x] **13-03 Scoped data layer** (DONE locally, 2026-10-28): `db/scope.ts` — repositories take a verified `HotelScope`
  (`hotelId`, role, permissions) and always filter by it; platform scope is explicit. Port
  `server/db/*` onto it. Tenancy test suite (every repository × foreign hotel = denied/empty).
  D1 scope gates cover booking reads, guest PII, booking value, cancellation, staff permission
  edits, and the restricted platform summary. Port each `server/db/*` module into a corresponding
  `server/d1/*` module with equivalent exports and happy-path plus cross-hotel denial tests; keep
  Supabase callers unchanged until 13-07/13-08. Do not port `channelPerformance` or
  `saveHotelSiteConfig`'s synthetic-success fallback. Platform summary `plan` and
  `payment_status` stay null until spec 12 billing exists. See the resolved scope decision in
  `.agent/OPEN_QUESTIONS.md`. The owner moved `server/db/booking.ts` to 13-04a because its public
  booking/availability behavior depends on SQL functions ported in 13-04. Live callers remain
  unchanged until 13-07/13-08.
- **13-04 Port SQL functions to services**: port the final definitions only; later date-ordered
  migrations supersede earlier definitions. Split into:
  - **13-04a Booking, availability, and pricing service**: `is_published_hotel`,
    `get_public_hotel`, `get_public_room_type_availability`,
    `get_public_room_type_availability_for_guests`, `update_room_type_with_occupancy_config`,
    and `transition_booking_status`; add the D1 `server/db/booking.ts` equivalent with the same
    nine exports and transactional overlap protection.
  - **13-04b iCal sync and export**: `sync_ota_ical_blocks`, `get_ota_ical_export`, and
    `ota_connection_room_same_hotel` (including its same-hotel trigger enforcement).
  - **13-04c Remaining service and trigger behaviors**: `is_super_admin`, `is_platform_admin`,
    `is_hotel_member`, `current_user_has_role`, `can_manage_property`, `can_manage_staff`,
    `can_manage_rates`, `can_manage_bookings`, `can_manage_housekeeping`, `can_manage_ical`,
    `transfer_hotel_admin`, `prevent_notification_content_changes`,
    `update_hotel_payment_settings_updated_at`, `update_payment_sessions_updated_at`, and
    `update_hotel_services_updated_at`.
- **13-05 Auth**: Better Auth on D1, TOTP 2FA (replaces `auth.mfa` flows incl. step-up),
  staff invites and hotel-owner signup links, session cookies; `getSupabaseIdentity` replaced by a
  `getIdentity` with the same shape so routers barely change.
- **13-06 Platform services**: R2 media upload/serve (replaces Forge `storagePut`, and B's
  planned Supabase Storage work), Cron Triggers for iCal sync (15 min) and later billing,
  SlipOK AES-GCM via WebCrypto, TM.30 template bundled as an asset (no `node:fs`), iCal URL
  guard without `node:dns` (Workers cannot reach private networks; keep the literal/hostname
  checks, resolve via DoH if still needed).
- **13-07 Client**: replace `@supabase/supabase-js` auth calls in the client with the new auth
  client; remove hard-coded Supabase URL/key fallbacks (`client/src/lib/supabase.ts`,
  `server/supabase.ts`, `server/_core/env.ts`).
- **13-08 Data migration + cutover**: export from Supabase (Postgres → JSON per table),
  transform, import to D1 staging, verify row counts and invariants, rehearse, then production
  import; copy every object in the Supabase Storage `hotel-media` bucket (B's 872234a) to R2 under
  the same `<hotel_id>/` keys and rewrite `hotel_media.url` to the R2 URLs; point the domain at
  the Worker; re-issue OTA export URLs; smoke test.
- **13-09 Decommission**: remove Express/Vercel files (`api/index.ts`, `vercel.json`,
  `server/_core/vite.ts`, `@supabase/*`, `pg`, `mysql2`, Manus/Forge leftovers), archive the
  Supabase project after a retention window, update `CLAUDE.md` (stack, commands, migrations
  section) and `.agent/BANNED_ZONE.md`.

## PostgreSQL behavior handed to 13-03 / 13-04

SQLite/D1 has no PostgreSQL function or RPC execution model, RLS, trigger functions, custom
ENUM type, GiST exclusion constraint, or `btree_gist`/`pg_cron`/`pg_net` extension support.
No `CREATE TYPE ... ENUM` appears in the root SQL; categorical values are text columns guarded
by CHECK constraints and those checks are represented in D1.

- **13-03 scoped data layer**: replace all RLS/`GRANT`/`REVOKE` behavior, `auth.uid()` and
  `SECURITY DEFINER`/`row_security` gates with verified `HotelScope` checks and support grant
  validation. `20261027_rls_write_hardening.sql`'s write boundaries are part of this work.
  Replace `prevent_double_booking` and `prevent_rate_override_overlap` GiST exclusion
  constraints with transactional application checks and concurrency tests. The OTA
  same-hotel trigger also needs repository validation.
- **13-04 service layer**: port these final function behaviors: `is_super_admin`,
  `is_platform_admin`, `is_hotel_member`, `current_user_has_role`, `can_manage_property`,
  `can_manage_staff`, `can_manage_rates`, `can_manage_bookings`, `can_manage_housekeeping`,
  `can_manage_ical`, `is_published_hotel`, `get_public_hotel`,
  `get_public_room_type_availability`, `get_public_room_type_availability_for_guests`,
  `update_room_type_with_occupancy_config`, `transition_booking_status`,
  `transfer_hotel_admin`, `sync_ota_ical_blocks`, `get_ota_ical_export`,
  `prevent_notification_content_changes`, `update_hotel_payment_settings_updated_at`,
  `update_payment_sessions_updated_at`, `update_hotel_services_updated_at`, and
  `ota_connection_room_same_hotel`. Later definitions in the date-ordered SQL replace earlier
  versions; port the final definitions only.
- **Triggers**: `notifications_content_immutable`, `hotel_payment_settings_updated_at`,
  `payment_sessions_updated_at`, `hotel_services_updated_at`, and
  `trg_ota_connection_room_same_hotel` need service/repository equivalents.
- **13-05 identity boundary**: UUIDs are stored as text and generated in the application;
  Supabase `auth.users` references (`hotel_users.user_id`, booking actor IDs, assigned staff,
  and support grant actors) become Better Auth relationships in 13-05. PostgreSQL `uuid`,
  `timestamptz`, `date`, and `jsonb` are represented as text/epoch-milliseconds/ISO-date/JSON
  text respectively. SQLite NUMERIC has no fixed decimal precision; 13-03 must use a safe
  money representation when porting calculations.
- **13-06 scheduled work**: `pg_cron`/`pg_net` are replaced by Workers Cron Triggers as already
  scoped in 13-06; they are not installed in D1.

## Coordination with B (Antigravity)
- B's in-flight work that targets Supabase specifically (Supabase Storage upload, a new RLS
  policy for `hotel_site_config`) becomes throwaway after 13-06/13-03. Recommended: B keeps
  UI work (WebsiteBuilder/PublicHotel screens) and codes data access against the repository
  interfaces A publishes in 13-03; image upload targets R2 directly in 13-06.
- Shared files touched by this spec beyond A's list: `server/routers.ts`, `server/db/*`,
  `client/src/lib/*`, `package.json`. A announces each ticket in `.agent/handoff.md` before
  starting it so B can avoid those files.

## Acceptance criteria
- [ ] The full app runs on one Worker on the launch domain; Vercel project removed
- [ ] All data lives in D1; Supabase project archived; no `@supabase/*` dependency left
- [ ] Login, MFA, staff invites, signup links work end to end
- [ ] Tenancy suite and concurrent double-booking test pass against real D1
- [ ] iCal import/export and the 15-minute cron work; OTA export URLs re-issued on the new domain
- [ ] Monthly platform bill verified at ~US$5 (+ email provider free tier)

## Definition of Done (per ticket)
- [ ] `pnpm test`, `pnpm check`, `pnpm build` pass — output pasted
- [ ] No TODO/FIXME in touched files
- [ ] `.agent/handoff.md` entry; this spec's ticket line ticked
- [ ] Human approval before anything reaches `main` or production
