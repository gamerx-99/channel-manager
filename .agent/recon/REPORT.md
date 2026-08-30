# Recon report

Written 2026-08-30, from this session's actual accumulated work (Financials module,
two production Vercel outages and their fixes, the signup-link feature, and the
initial DB seeding of the first real hotel) — not a cold first read. Treat this as
current; re-run/append a dated section rather than trusting it blindly if a lot of
time has passed since 2026-08-30.

## Inventory

- `client/src/` — React app. `pages/` is one file per route (`Home.tsx`,
  `Bookings.tsx`, `HotelStaff.tsx`, `Financials.tsx`, `ChannelPerformance.tsx`,
  `PublicHotel.tsx`, `HotelOwnerSignup.tsx`, etc.). `App.tsx` owns routing (`wouter`),
  the sidebar nav (built from `can(permission)` checks), and `PrivateRoute`.
  `lib/routeScope.ts` maps a pathname to the `Permission` required to view it —
  the client-side half of every access-control boundary.
- `server/routers.ts` — the single tRPC router (`appRouter`), namespaced under
  `channelManager`. Every procedure follows: permission check (`requirePermission`
  or `requireHotelPermission`) → `try { ... business logic ... } catch (error) {
  return rethrowDomainError(error); }`.
- `server/db.ts` — RLS-scoped Supabase queries (take a `client: SupabaseClient`
  parameter, always the caller's token-scoped client — RLS is the real boundary).
- `server/supabase.ts` — the service-role admin client (`createSupabaseAdminClient`)
  and everything that must bypass RLS on purpose: `auth.admin.*` user management,
  and (as of this session) the `hotel_signup_links` helpers.
- `shared/authorization.ts` — the single source of truth for roles and permissions.
  `PERMISSIONS`, `ROLE_PERMISSIONS` (the matrix), `PLATFORM_ROLES` vs
  `ASSIGNABLE_STAFF_ROLES`. Both client and server import this — never duplicate a
  permission check's logic elsewhere.
- `server/_core/index.ts` — Express app entry. Exports `app` (default export) for
  Vercel; only calls `app.listen()` when `process.env.VERCEL !== "1"`. Imports `./vite`
  *lazily* (dynamic import inside `startServer()`) specifically so the real `vite`/
  rollup packages are never loaded on Vercel's Lambda — see DECISIONS.md.
- `api/index.ts` — the Vercel serverless function entry. Imports `../dist/index.js`
  (the pre-bundled output of `esbuild --bundle --splitting`), not the source tree —
  see DECISIONS.md for why this matters.
- `*.sql` at repo root — numbered migrations + `verify_*.sql` companions, applied by
  hand via the Supabase SQL editor (no live `DATABASE_URL` in this environment).
- `todo.md` — the historical build log (everything done before this workflow
  existed) plus the "Roadmap: Remaining Modules" section this scaffold's `specs/`
  directory translates into executable form.
- `AUTHORIZATION_MODEL.md` — documents the six/seven-role model and explicitly notes
  OTA is iCal-only by design (ARI sync / booking push permissions exist but are
  granted to nobody).

## System map

```
Browser (React/wouter)
  ├─ /login, /signup/:token, /:slug   → public, outside PrivateRoute
  └─ everything else                   → PrivateRoute → routeScope.ts permission gate
        │
        ▼ tRPC over /api/trpc/*
Vercel Lambda (api/index.ts → dist/index.js, the bundled Express+tRPC app)
        │
        ├─ requirePermission / requireHotelPermission (shared/authorization.ts matrix)
        │
        ├─ RLS-scoped Supabase client (server/db.ts) ── for anything the caller's
        │    own Postgres RLS policies should gate (hotels, bookings, staff, etc.)
        │
        └─ Service-role admin client (server/supabase.ts) ── only for what must
             bypass RLS on purpose: Supabase Auth user admin, and hotel_signup_links
             (an anonymous signer has no RLS-visible membership yet)
                │
                ▼
        Supabase Postgres (RLS policies are the real authorization boundary,
        not just the app-layer checks — is_super_admin()/is_platform_admin()/
        is_hotel_member() Postgres functions)
```

## Contradictions

None found between documents. `AUTHORIZATION_MODEL.md` and `shared/authorization.ts`
agree with each other and with what's actually enforced in `server/routers.ts` (spot
checked, not exhaustively re-verified every session).

## Gaps

- **No payment/paid-status tracking on bookings.** `BookingRecord` has `price` only —
  no `payment_status`/`amount_paid`. Blocks any "collected vs outstanding" reporting
  and is Phase A's first real ticket.
- **No lint tooling.** `package.json` has `test`/`check`/`build` but no `lint` script.
- **No rate limiting** on the two public, unauthenticated tRPC surfaces
  (`validateSignupLink`/`completeHotelOwnerSignup`, and `publicHotel`) — anyone can
  hammer these.
- **No admin UI for `hotel_media` uploads** despite the table and a read path
  already existing (`server/db.ts:249`, consumed by `PublicHotel.tsx`) — media must
  currently be inserted directly in Supabase.
- **`hotel_domains` table exists in the schema but has zero application code**
  referencing it anywhere — confirmed via full-repo search this session.
- **No migration automation.** `server/runPostgresMigration.mjs` and
  `server/verifySupabaseMigration.mjs` exist but can't run — `DATABASE_URL`/
  `SUPABASE_POOLER_DB_URL` in `.env` are placeholder values in this environment.
- **Local dev server (`pnpm dev`) has failed to bind** in this sandboxed environment
  every time it's been tried this session (no "Server running on..." ever logged) —
  not root-caused. Verification this session has relied on the live Vercel deploy
  instead.

## Risks

Ordered roughly by severity, based on what's actually gone wrong this session:

1. **Vercel deploy config is fragile and has broken production twice already**
   (wrong `outputDirectory`/missing `vercel.json` entirely; then an eager `vite`
   import crashing every serverless cold start via a missing Linux rollup binary).
   Both are now fixed and understood, but any future change to `vercel.json`,
   `api/index.ts`, or the top-level imports in `server/_core/index.ts` should be
   treated as deploy-risk, not a routine edit — verify with a real deploy + browser
   check, not just `pnpm build` passing locally.
2. **`requireHotelPermission` unconditionally bypasses for `super_admin`.** Any new
   feature that must be withheld from `super_admin` on purpose (like
   `property.view_financials`) has to use `requirePermission` instead and must not
   also be granted to `super_admin` in the matrix — easy to get wrong by copying the
   more common `requireHotelPermission` pattern without noticing this distinction.
3. **Public, unauthenticated tRPC procedures have no rate limiting** — both the
   signup-link redemption flow and the public hotel page are exposed to abuse today.
4. **Manual migration application is a real single point of failure.** Every
   migration this session was applied by a human pasting SQL into the Supabase SQL
   editor. There's no automated record that a given migration was actually run
   beyond the human's word and a `verify_*.sql` they ran once.

## Unknown-but-blocking

Only two, both already logged in `.agent/OPEN_QUESTIONS.md` and both scoped to
Phase A specifically — nothing blocks starting Phase B–H:

1. Where should a hotel's `slipok_api_key` be encrypted at rest (Supabase Vault vs.
   app-level encryption with a server-only secret)?
2. What permission gates the SlipOK settings page — reuse `property.manage_profile`,
   or add a new dedicated permission?

No other Unknown-but-blocking items identified — proceeding to spec/ticket work for
Phases B onward does not require further human input at this time.

---

## 2026-08-30 — T09-01 recon: Authenticator (TOTP MFA) — blocking decision

### Scope & method
- Spec read: `specs/09-authenticator-mfa.md` (Goal: TOTP via `supabase.auth.mfa.*`, prerequisite for Phase 01 SlipOK step-up).
- Code inspection (no production code touched, recon only):
  - `client/src/pages/Login.tsx` — `supabase.auth.signInWithPassword` → `navigate('/dashboard')` unconditionally.
  - `client/src/_core/hooks/useAuth.ts` — `getSession` + `onAuthStateChange` only; no AAL/MFA awareness.
  - `client/src/lib/supabase.ts` — browser client `createClient(url, anonKey, { auth: { persistSession, autoRefreshToken, detectSessionInUrl } })`.
  - `shared/authorization.ts` — `PLATFORM_ROLES = ['super_admin','admin']`, permission matrix, `super_admin` blanket grant minus `property.view_financials`.
  - `client/src/App.tsx` `PrivateRoute` — gates on `useAuth` + `trpc.auth.me` + `routeScope.getRouteScopeDecision`, no MFA.
  - Supabase JS SDK `supabase.auth.mfa` via installed bundle inspection: `node_modules/@supabase/supabase-js/dist/umd/supabase.js` (v2.112.3) + `GoTrueClient` internals (`_enroll`, `_challenge`, `_verify`, `_unenroll`, `_listFactors`, `_getAuthenticatorAssuranceLevel`, `_challengeAndVerify`).

### Supabase Auth MFA API (verified against vendored code)
- **Client surface** (spec-correct): `supabase.auth.mfa.enroll()` / `.challenge()` / `.verify()` / `.unenroll()` + `listFactors()` + `challengeAndVerify()` + `getAuthenticatorAssuranceLevel()` — matches spec's `enroll/challenge/verify/unenroll` contract. Spec's `client/src/pages/Login.tsx` `supabase` import (`@/lib/supabase`) is the correct client to use.
- **Enroll**: `mfa.enroll({ factorType:'totp', friendlyName, issuer })` → `{ data: { id, type:'totp', totp:{ secret, qr_code:'data:image/svg+xml;utf-8,...', uri } }, error }`. QR SVG is already data-URI encoded by the SDK.
- **Challenge**: `mfa.challenge({ factorId })` → `{ data: { id: challengeId, type, ... }, error }`.
- **Verify**: `mfa.verify({ factorId, challengeId, code })` — on success calls `_saveSession` with new `expires_in` session and emits `MFA_CHALLENGE_VERIFIED`, elevating JWT `aal` to `aal2`. `challengeAndVerify({ factorId, code })` is a convenience that does challenge+verify in one call.
- **List/Unenroll**: `mfa.listFactors() → { data:{ all, totp, phone, webauthn } }`, `mfa.unenroll({ factorId })`. Admin API `supabase.auth.admin.mfa.listFactors/deleteFactor` also exists (`GoTrueAdminApi`) but is service-role only — not used client-side.
- **AAL / step-up**: `mfa.getAuthenticatorAssuranceLevel(jwt?) → { data:{ currentLevel: 'aal1'|'aal2'|null, nextLevel, currentAuthenticationMethods: amr[] }, error }`. Implementation: decodes JWT `payload.aal` / `payload.amr`, checks `user.factors` for verified factors to derive `nextLevel='aal2'`; if no session, returns null levels. Spec's `requireRecentMfaVerification()` should wrap this (check `currentLevel === 'aal2'`) rather than assume a custom shape — and must verify actual freshness window against `amr`/`aal` claims, not a new table, unless Supabase's session proves insufficient.
- **No new table expected** — confirmed: factor state is stored by Supabase Auth itself. Only if "verified within last N minutes" needs app-side tracking beyond `aal`/`amr` would a table be a deviation — recon finds no evidence it's needed yet.

### Current auth flow — findings
- **Login.tsx (27 lines)**: single `signInWithPassword`, error display, disabled submit. No MFA branch — any user with valid password lands on `/dashboard`. Would need post-login check: for platform roles, call `mfa.listFactors()` + `mfa.getAuthenticatorAssuranceLevel()`; if no verified `totp` factor, redirect to enroll; if factor exists but `currentLevel !== 'aal2'`, redirect to challenge/verify; only then allow dashboard.
- **useAuth.ts (76 lines)**: `refresh()` → `getSession`, `onAuthStateChange` → `setUser`, plus `logout`/`redirectOnUnauthenticated`. `user` is `{id,email,name}` from `user_metadata` — no role, no AAL. Role comes separately via `trpc.auth.me` (seen in `App.tsx:327` and `Home.tsx:18`). Hook will need either an `aal` field or a separate MFA-aware hook/guard; recon does not modify it.
- **authorization.ts**: platform roles are `super_admin` (full minus `service.*` and `property.view_financials`) and `admin` (read-only cross-hotel). MFA requirement must gate on `PLATFORM_ROLES`, not permission, to avoid `requireHotelPermission`'s unconditional `super_admin` bypass.
- **App.tsx PrivateRoute (324-364)**: loading → role/hotel visibility → permission gate via `getRouteScopeDecision`. No MFA check exists; future enforcement could be a wrapper (e.g., `RequireMfa` or `RequireRecentMfaVerification`) that runs before `AppShell`.

### Decision: blocking vs grace-period (T09-01)
- **Blocking** — `super_admin`/`admin` must enroll MFA at first login, before any dashboard access. Spec preference adopted. Rationale: safer (no window where `super_admin`'s unconditional hotel bypass is unprotected), simpler (no expiry/nag state, no audit gap), stateless (Supabase factor state is source of truth). Grace-period rejected: adds temporal state, nag UI, and leaves the two most privileged roles exposed during the window.
- **Hotel roles**: opt-in enrollment only this phase. SlipOK step-up (Phase 01) is the exception: opening/saving SlipOK settings requires fresh MFA verification for *every* role including `hotel_owner`; a `hotel_owner` without a factor is prompted to enroll at that point, not silently blocked — per spec Business rules.
- **Error handling**: no factor on step-up → enroll prompt; expired freshness → re-prompt TOTP, no silent fallback — both per spec.
- **No production code touched** in this recon; decision logged to `.agent/DECISIONS.md` as `2026-08-30 — MFA: blocking enforcement for super_admin/admin (T09-01 recon)` with status open.

### What remains for implementation tickets
- Design `requireRecentMfaVerification()` (AAL freshness check) against live JWT `aal`/`amr` — verify Supabase's actual session shape before fixing a window (spec warns "don't assume a shape").
- Enrollment/challenge/verify UI (profile settings for opt-in, login拦截 for blocking, SlipOK settings step-up challenge).
- Tests per spec: mocked Supabase client enrollment flow, SlipOK redirect for `hotel_owner`, `super_admin` login without factor triggers enrollment.

### Evidence
- `specs/09-authenticator-mfa.md:8-10,40-49` (blocking preferred, SlipOK step-up).
- `node_modules/@supabase/supabase-js/dist/umd/supabase.js` Grep findings: `GoTrueClient.mfa={verify,enroll,unenroll,challenge,listFactors,challengeAndVerify,getAuthenticatorAssuranceLevel}`, `this.mfa={verify:this._verify.bind…}`, `MFA_CHALLENGE_VERIFIED`, `_getAuthenticatorAssuranceLevel` reading `payload.aal`/`amr`.
- `client/src/pages/Login.tsx:17` (`signInWithPassword`), `client/src/_core/hooks/useAuth.ts:44,52`, `shared/authorization.ts:21-23` (`PLATFORM_ROLES`).

---

## 2026-08-30 — T03-01 recon: Housekeeping task board — fixed checklist + three-state status

### Scope & method
- Spec read: `specs/03-housekeeping-board.md` (goal per-day assignable task board, `housekeeping_tasks` with `room_id`/`booking_id`/`assigned_to`/`checklist`/`status`/`due_date`).
- Code inspection (no production code touched, recon only):
  - `shared/authorization.ts` — PERMISSIONS + ROLE_PERMISSIONS matrix for `housekeeping.view_room_status`/`housekeeping.update_room_status`.
  - `server/db.ts` — existing types (`HotelRecord`, `RoomTypeRecord`, `BookingRecord`, `AvailabilityRecord`, `RateOverrideRecord`, `HotelUserAssignmentRecord`) and RLS-scoped helper pattern (`client: SupabaseClient` parameter, `throwOnError`, per-hotel scoping via `hotel_id`).
  - `supabase_migration_production.sql` — canonical Postgres schema (Supabase): `hotels`, `hotel_users`, `rooms`, `room_types`, `bookings`, `room_housekeeping_status`, `can_manage_housekeeping()`, RLS policies; `drizzle/schema.ts` is a stale MySQL template and intentionally ignored.
  - `client/src/pages/Home.tsx` + `client/src/components/DashboardCalendarView.tsx:70` — precedent for view-vs-edit split (`canEditAvailability = super_admin/hotel_owner/revenue_manager`, view-only otherwise).
  - `client/src/App.tsx:180` + `client/src/lib/routeScope.ts` — housekeeping sidebar placeholder (`can("housekeeping.view_room_status")` toast placeholder, not a real route).

### Existing tables & why a new table is needed
- `hotels(id uuid PK, name, slug UNIQUE, address, owner_contact, public_enabled, created_at)` — `supabase_migration_production.sql:25-31`.
- `rooms(id uuid PK, hotel_id uuid FK hotels ON DELETE CASCADE, room_type_id uuid FK room_types, room_number text, status text CHECK available/occupied/maintenance, UNIQUE hotel_id+room_number)` — `supabase_migration_production.sql:50-56`. `room_housekeeping_status` is keyed to `room_id PK` and tracks *current condition* only (`clean/dirty/out_of_order`).
- `bookings(id uuid PK, hotel_id uuid FK, room_id uuid FK ON DELETE SET NULL, guest_name, check_in/check_out date CHECK check_out>check_in, price, source, status)` with `prevent_double_booking EXCLUDE USING gist (room_id, daterange)` — `supabase_migration_production.sql:57-73` + `supabase_migration_production.sql:95-108`.
- `room_housekeeping_status(room_id uuid PK FK rooms ON DELETE CASCADE, status text DEFAULT 'clean' CHECK clean/dirty/out_of_order, updated_by uuid FK auth.users, updated_at)` — `supabase_migration_production.sql:479-491`. Single row per room, no assignee, no due date, no booking linkage — confirms a separate `housekeeping_tasks` per-day task table is required per spec Data model.
- `drizzle/schema.ts:1-14` defines a MySQL `users(openId, role user/admin)` template that is not the Supabase source of truth; `drizzle.config.ts:8 dialect:mysql` confirms drizzle is disconnected from the live `public.*` Supabase schema — ignore for housekeeping migration planning.

### Housekeeping permissions — verified matrix
- **PERMISSIONS declares both** `housekeeping.view_room_status` (`shared/authorization.ts:67`) and `housekeeping.update_room_status` (`shared/authorization.ts:68`).
- **ROLE_PERMISSIONS matrix** (`shared/authorization.ts:85-155`):
  - `super_admin: PERMISSIONS.filter(!service.* && != property.view_financials)` (`shared/authorization.ts:90-92`) — blanket includes **both** housekeeping perms.
  - `admin: [platform.view_all_hotels, property.view, property.view_reports, operations.view_bookings, housekeeping.view_room_status, ota.view_status, ota.view_sync_logs]` (`shared/authorization.ts:96-104`) — **view only**, line `101`.
  - `hotel_owner: [... housekeeping.view_room_status, housekeeping.update_room_status ...]` (`shared/authorization.ts:117-118`) — **both**.
  - `revenue_manager: [property.view, property.view_reports, revenue.manage_* x4, ota.view_status, ota.view_sync_logs]` (`shared/authorization.ts:128-137`) — **neither** housekeeping permission. Contradicts spec `specs/03-housekeeping-board.md:19` parenthetical assumption that revenue_manager has view.
  - `front_desk: [... housekeeping.view_room_status ...]` (`shared/authorization.ts:138-148`, line `145`) — **view only**.
  - `housekeeping: [property.view, housekeeping.view_room_status, housekeeping.update_room_status]` (`shared/authorization.ts:149-153`, lines `151-152`) — **both**.
- **Client mirror**: `client/src/App.tsx:180` gates Housekeeping nav on `can("housekeeping.view_room_status")` (toast placeholder), so visibility surfaces for `hotel_owner`/`front_desk`/`housekeeping` + both platform roles (via `is_hotel_member` at RLS). `client/src/lib/routeScope.ts:15-27` has no housekeeping route yet — will need `housekeeping.view_room_status` entry for future `/hotels/:id/housekeeping`.
- **RLS capability function**: `can_manage_housekeeping(target_hotel_id uuid)` (`supabase_migration_production.sql:683-693`) returns `is_super_admin() OR current_user_has_role('housekeeping', hotel_id) OR current_user_has_role('hotel_owner', hotel_id)`. Existing `room_housekeeping_status` RLS uses it: `room_housekeeping_insert/update ... USING (can_manage_housekeeping(r.hotel_id))` (`supabase_migration_production.sql:821-829`). New `housekeeping_tasks` write policies should reuse this function.

### Decision: checklist as fixed booleans vs jsonb, and status enum

#### Checklist: fixed boolean columns — not jsonb
- **Spec constraint** (`specs/03-housekeeping-board.md:26-28`): "checklist (jsonb **or** a fixed set of boolean columns — **decide based on how much variability real checklists need; start with a fixed small set unless told otherwise**, per the safest default rule)". No variability signal exists in the spec.
- **Hard Rule 7** (`CLAUDE.md:7` — never invent a requirement, pick safest default, mark `ASSUMPTION:`) therefore forces **fixed small set**. `jsonb` would be an invented flexibility requirement.
- **Practical comparison** (for T03-02):
  - *Fixed booleans*: queryable `WHERE bed_made AND bathroom_cleaned`, no GIN index, `zod.boolean()`/Supabase row type maps directly, trivial `ALTER TABLE ADD COLUMN DEFAULT false` evolution.
  - *jsonb* e.g. `{ items: [{key:"bed_made", done:false}] }`: needs `CHECK (jsonb_typeof(checklist)='array')` + `jsonb_path` queries or GIN, untyped `checklist->>` access, JSON schema drift risk — over-engineering for a board whose acceptance criteria (`specs/03-housekeeping-board.md:45-51`) is "day view grouped by room with status/assignee", not "per-hotel custom checklist builder".
- **Reversibility**: adding a `jsonb` column and migrating booleans into it is forward-compatible; unrolling `jsonb` into typed columns is harder. Fixed-first is lower risk.
- **Proposed columns** (T03-02 to finalise): `bed_made boolean NOT NULL DEFAULT false`, `bathroom_cleaned boolean NOT NULL DEFAULT false`, `towels_replaced boolean NOT NULL DEFAULT false`, `amenities_restocked boolean NOT NULL DEFAULT false`, `floor_cleaned boolean NOT NULL DEFAULT false` — 5 items covering standard turnover without inventing domain-specific items (minibar, maintenance) the spec never mentions. Snake_case per `supabase_migration_production.sql` conventions.

#### Status enum: `text + CHECK IN ('pending','in_progress','done')`
- **Spec Data model** (`specs/03-housekeeping-board.md:29`): "`status` (`pending`/`in_progress`/`done`)" — three values verbatim.
- **Codebase precedent**: every status column is `text` with `CHECK`, never native `CREATE TYPE ... AS ENUM` — `rooms.status CHECK (status IN ('available','occupied','maintenance'))` (`supabase_migration_production.sql:54`), `bookings.status CHECK (status IN ('confirmed','checked_in','checked_out','cancelled'))` (`supabase_migration_production.sql:62`), `room_housekeeping_status.status CHECK (status IN ('clean','dirty','out_of_order'))` (`supabase_migration_production.sql:480`). No `CREATE TYPE ... AS ENUM` exists in the migration history. Reusing `text + CHECK` avoids `DROP TYPE` pain and keeps RLS predicate text-comparison.
- Recommended DDL: `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done'))`.

### Proposed table shape for T03-02 (recon only — not yet migrated)
```sql
create table if not exists public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  bed_made boolean not null default false,
  bathroom_cleaned boolean not null default false,
  towels_replaced boolean not null default false,
  amenities_restocked boolean not null default false,
  floor_cleaned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_housekeeping_tasks_hotel_due on public.housekeeping_tasks (hotel_id, due_date);
create index if not exists idx_housekeeping_tasks_room_id on public.housekeeping_tasks (room_id);
create index if not exists idx_housekeeping_tasks_assigned_to on public.housekeeping_tasks (assigned_to) where assigned_to is not null;
```
- **Why denormalise `hotel_id`**: day view "list tasks for that hotel, grouped by room" (`specs/03-housekeeping-board.md:45`) scopes by `hotel_id` without a mandatory `rooms` join in every RLS predicate. Enforce `room_id.hotel_id = hotel_id` via app validation in tRPC handler (primary) + trigger as backstop.
- **Due date population** (`specs/03-housekeeping-board.md:37-38`): when `booking_id` is provided and no explicit `due_date` supplied, default `due_date` from `bookings.check_out`. Implement in `server/db.ts` helper or tRPC handler before insert — not as a DB default since it requires a join.
- **RLS sketch** (T03-02 to author):
  - `ENABLE ROW LEVEL SECURITY`.
  - `SELECT` using `is_hotel_member(hotel_id)` (any member + platform readers via `is_platform_admin`).
  - `INSERT/UPDATE/DELETE` using `can_manage_housekeeping(hotel_id)` (owner/housekeeping/super_admin), with `UPDATE` nuance if spec acceptance "housekeeping can update status for its own tasks" requires `assigned_to = auth.uid()` carve-out — flagged for T03-03.
- **Assignment validation** (`specs/03-housekeeping-board.md:41-42`): `assigned_to` must be a `hotel_users` member of target `hotel_id`; reject with `BAD_REQUEST` via `rethrowDomainError` pattern (`server/routers.ts:211-235`).

### Business rules — view-vs-edit precedent reuse
- `specs/03-housekeeping-board.md:32-35`: "Editing (assigning, changing status) follows the **same view-vs-edit role split already established in `DashboardCalendarView`'s availability quick-actions**".
- **Precedent** (`client/src/pages/Home.tsx:canEditCalendar`): `canEditCalendar = role in (super_admin, hotel_owner, revenue_manager)` — those three can `Save`/`Stop Sell`, all others see `View only` note (`client/src/components/DashboardCalendarView.tsx:244`).
- **Adaptation for housekeeping board**: the reused *pattern* is "gate edits on `can('housekeeping.update_room_status')`", but the *role set* is `super_admin`/`hotel_owner`/`housekeeping` for edits, `front_desk`/`admin` view-only — matching spec acceptance "front_desk (and housekeeping for its own tasks) can update status" (`specs/03-housekeeping-board.md:48`). No new `Permission` string required — `housekeeping.update_room_status` already exists.
- **Revenue manager nuance**: because it currently lacks `housekeeping.view_room_status`, it would be denied even the day view today. If product intends revenue_manager to see (but not edit) the board, a matrix change (`shared/authorization.ts:128-137` add `housekeeping.view_room_status`) is needed — flagged here, not assumed. Safest default is to keep matrix as-is.

### What remains for T03-02 / T03-03 / T03-04
- **T03-02** (table + router scaffolding): author `YYYYMMDD_add_housekeeping_tasks.sql` + `verify_*.sql` with DDL above, RLS policies (`SELECT` via `is_hotel_member`, write via `can_manage_housekeeping`), indexes, `updated_at` trigger; add `server/db.ts` helpers `listHousekeepingTasks`, `createHousekeepingTask`, `updateHousekeepingTaskStatus`; stub tRPC routes (`createHousekeepingTask`/`listHousekeepingTasks`/`updateHousekeepingTaskStatus`) gated on the two housekeeping permissions and using `rethrowDomainError` for `P0002`/`23514`/`42501`.
- **T03-03** (assign + validation): enforce `assigned_to` membership check (`hotel_users WHERE user_id = assigned_to AND hotel_id = :hotel_id`) -> `BAD_REQUEST`; enforce `hotel_id`/`room_id` invariant; auto-populate `due_date` from `bookings.check_out` when `booking_id` present and `due_date` omitted; enforce `booking_id` belongs to same `hotel_id`.
- **T03-04** (UI): day view grouped by room (`room_number` via `rooms` join), status + assignee display, assignment affordance gated on `can('housekeeping.update_room_status')`, status update for `housekeeping` limited to own tasks vs `hotel_owner` for any task; replace placeholder `client/src/App.tsx:180` button with real navigation; add `client/src/lib/routeScope.ts` permission mapping for `/housekeeping` or `/hotels/:id/housekeeping`.

### Evidence (file:line)
- `specs/03-housekeeping-board.md:15-18` interface contract permissions, `specs/03-housekeeping-board.md:23-29` data model checklist/status note, `specs/03-housekeeping-board.md:32-38` business rules + due_date auto-populate, `specs/03-housekeeping-board.md:41-42` assignment error handling, `specs/03-housekeeping-board.md:45-51` acceptance criteria.
- `shared/authorization.ts:45-76` PERMISSIONS includes `housekeeping.view_room_status` and `housekeeping.update_room_status`, `shared/authorization.ts:67-68` exact lines, `shared/authorization.ts:90-92` super_admin blanket, `shared/authorization.ts:96-104` admin view-only, `shared/authorization.ts:105-127` hotel_owner both, `shared/authorization.ts:128-137` revenue_manager neither, `shared/authorization.ts:138-148` front_desk view-only, `shared/authorization.ts:149-153` housekeeping both.
- `server/db.ts:4-20 HotelRecord/RoomTypeRecord`, `server/db.ts:43-56 BookingRecord`, `server/db.ts:67-69 throwOnError`, `server/db.ts:97-115 listManagedHotels RLS pattern`, `server/db.ts:256-290 RateOverrideRecord pattern`.
- `supabase_migration_production.sql:25-31 hotels`, `supabase_migration_production.sql:50-56 rooms`, `supabase_migration_production.sql:57-73 bookings`, `supabase_migration_production.sql:479-491 room_housekeeping_status`, `supabase_migration_production.sql:683-693 can_manage_housekeeping`, `supabase_migration_production.sql:818-829 room_housekeeping_status RLS`, `supabase_migration_production.sql:95-108 prevent_double_booking EXCLUDE`, `supabase_migration_production.sql:54,62,480 status CHECK pattern`.
- `drizzle/schema.ts:1-14` MySQL template vs `supabase_migration_production.sql` canonical, `drizzle.config.ts:8 dialect:mysql`.
- `client/src/pages/Home.tsx` `canEditCalendar = super_admin/hotel_owner/revenue_manager`, `client/src/components/DashboardCalendarView.tsx:70,241-256` `canEditAvailability` gate and `View only` note.
- `client/src/App.tsx:180` housekeeping placeholder `can("housekeeping.view_room_status")` toast, `client/src/lib/routeScope.ts:8-27` permission routing (no housekeeping route yet).
- `server/routers.ts:151-183` `rlsClient`/`requirePermission`/`requireHotelPermission` gating pattern, `server/routers.ts:211-235` `rethrowDomainError` mapping.
- `server/channelManager.availability.test.ts:46,101` role-boundary test style to mirror for `server/housekeeping.test.ts`.

### No production code touched
Pure recon per `.agent/tickets/T03-01-housekeeping-recon.md` — decision and report only, no `pnpm test/check/build` required.

---

## 2026-08-30 — T04-01 recon: Communications & Messaging — message_threads+messages, reuse operations.* permissions, in-app-only v1, Vercel Cron trigger

### Scope & method
- Spec read: `specs/04-communications.md` (Goal: per-booking message threads + templated pre-arrival/post-stay; Non-goals: SMS/WhatsApp in-app-only v1; Interface: `sendMessage`/`listMessages` scoped to booking/hotel gated by `operations.*`; Data model: `message_threads` + `messages`; Business rules: templated trigger needs job runner — check Vercel Cron vs Supabase scheduled).
- Code inspection (no production code touched, recon only):
  - `shared/authorization.ts` — `PERMISSIONS` and `ROLE_PERMISSIONS` matrix for `operations.view_bookings`/`operations.manage_bookings`.
  - `server/db.ts` — `BookingRecord` (`server/db.ts:43-57`), `listBookingsForHotel` (`server/db.ts:208-228`), `createBookingWithGuests` (`server/db.ts:332-355`), RLS-scoped helper pattern (`client: SupabaseClient`, `throwOnError`).
  - `supabase_migration_production.sql` — canonical Postgres schema (`hotels` `supabase_migration_production.sql:12-20`, `bookings` `supabase_migration_production.sql:58-73`, `bookings_manage` RLS `supabase_migration_production.sql:349-352`, `is_hotel_member` `supabase_migration_production.sql:189-203`, `is_super_admin`, `is_platform_admin`).
  - `server/routers.ts` — `requirePermission`/`requireHotelPermission` gating (`server/routers.ts:182-206`), bookings procedures (`server/routers.ts:791-870` `operations.view_bookings`/`operations.manage_bookings`).
  - `vercel.json:1-14` — current deploy config (no `crons` key), `package.json:6-15` scripts/deps (no cron runtime), `client/src/App.tsx:76-78,176-178` Communications placeholder + `client/src/lib/routeScope.ts:15-27` + `client/src/pages/Bookings.tsx:42-46`.
  - Supabase scheduled / pg_cron search: `supabase_migration_production.sql:6` shows only `btree_gist` extension; grep `cron|schedule` hits only Manus legacy (`server/_core/heartbeat.ts`, `server/_core/sdk.ts:323 CRON_OPEN_ID_PREFIX`, `docs/MANUS_OAUTH_AUDIT.md:107`).

### Existing tables & why two new tables are needed
- `hotels(id uuid PK, slug UNIQUE)` `supabase_migration_production.sql:12-20`; `hotel_users(hotel_id uuid FK hotels, user_id uuid FK auth.users, role text CHECK)` `supabase_migration_production.sql:22-28`.
- `bookings(id uuid PK, hotel_id uuid FK hotels ON DELETE CASCADE, room_id uuid FK rooms ON DELETE SET NULL, guest_name text, check_in/check_out date CHECK check_out>check_in, price numeric, source text, status text, created_at timestamptz)` `supabase_migration_production.sql:58-73` + `BookingRecord` `server/db.ts:43-57` (joined `rooms(room_number,room_types(name))`, `guests[]`).
- No `message_threads` or `messages` table exists — verified via grep across `supabase_migration_production.sql` (zero hits) and `server/db.ts` search. Spec `specs/04-communications.md:30-32` defines green-field shape; no existing table to reuse.

### Permissions — verified matrix for operations.*
- `PERMISSIONS` declares `operations.view_bookings` `shared/authorization.ts:62` and `operations.manage_bookings` `shared/authorization.ts:63` (alongside `operations.manage_guests`, `operations.manage_checkin_checkout`, `operations.export_tm30`).
- `ROLE_PERMISSIONS` `shared/authorization.ts:85-155`:
  - `super_admin: PERMISSIONS.filter(!service.* && != property.view_financials)` `shared/authorization.ts:90-92` — blanket includes **both** `operations.view_bookings` and `operations.manage_bookings`.
  - `admin: [platform.view_all_hotels, property.view, property.view_reports, operations.view_bookings, housekeeping.view_room_status, ota.view_status, ota.view_sync_logs]` `shared/authorization.ts:96-104` line `100` — **view only** (no `manage_bookings`).
  - `hotel_owner: [property.view, ..., operations.view_bookings, operations.manage_bookings, ...]` `shared/authorization.ts:105-127` lines `112-113` — **both**.
  - `revenue_manager: [property.view, property.view_reports, revenue.manage_*]` `shared/authorization.ts:128-137` — **neither** operations.* permission (revenue role never touches bookings).
  - `front_desk: [property.view, operations.view_bookings, operations.manage_bookings, ...]` `shared/authorization.ts:138-148` lines `140-141` — **both**.
  - `housekeeping: [property.view, housekeeping.*]` `shared/authorization.ts:149-153` — **neither** (no booking access).
  - `api_service: [service.ical_sync]` `shared/authorization.ts:154` — **neither**.
- Coverage matches communications audience exactly: everyone who should see a thread (`super_admin`, `admin` read-only, `hotel_owner`, `front_desk`) already has `view_bookings`; everyone who should post (`super_admin`, `hotel_owner`, `front_desk`) already has `manage_bookings`. No gaps, no surplus requiring a new permission.
- Client mirrors: `client/src/App.tsx:76-78` gates Bookings nav on `can("operations.view_bookings")`; `client/src/App.tsx:176-178` Communications placeholder is a `can("operations.view_bookings")`-adjacent toast; `client/src/lib/routeScope.ts` maps `/bookings` to `operations.view_bookings`. New Communications route under `/hotels/:id/bookings` or `/hotels/:id/communications` should reuse same mapping.
- Server gating precedent: `server/routers.ts:797` `requireHotelPermission(ctx.user, input, 'operations.view_bookings')` for `bookings` query; `server/routers.ts:870` `requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings')` for `createBooking`. Same `requireHotelPermission(hotel_id, ...)` pattern applies to `listMessages`/`sendMessage`.

### Decision: reuse operations.view_bookings / operations.manage_bookings — no new Permission
- Spec guidance `specs/04-communications.md:24-27` says "likely `operations.manage_bookings` is close enough to reuse, confirm before adding a new permission unnecessarily." Recon confirms it is exactly close enough — role sets are identical. Hard Rule 7 therefore selects reuse.
- T04-02 to gate: `listThreads`/`listMessages` on `operations.view_bookings`; `createThread`/`sendMessage` on `operations.manage_bookings` via `requireHotelPermission`. No new `Permission` string needed. If product later needs thread-level granularity (e.g. `front_desk` read-only), add narrow permission then — not now.

### Decision: in-app-only v1 — no SMS/WhatsApp/email delivery
- Spec Non-goals `specs/04-communications.md:10-15` says SMS/WhatsApp needs a third-party provider decision, default to in-app-only unless told otherwise. Blocking-ish question `specs/04-communications.md:17-21` says if unanswered default to in-app-only and log in `OPEN_QUESTIONS.md`.
- Evidence that in-app-only is correct default: `.agent/OPEN_QUESTIONS.md` has no provider answer; no `RESEND_API_KEY`/`TWILIO_*`/`SENDGRID_*` env in `.env.example`/`.env`; `package.json` has no `twilio`/`resend`/`nodemailer` deps; guests have no accounts today (spec line 14-15). Threads are staff-visible only, rendered from `Bookings.tsx` per `specs/04-communications.md:45-46`.
- Result: T04-02/T04-04 build in-app thread view + composer inside `Bookings.tsx`. External delivery stays as an OPEN_QUESTIONS entry for a future ticket.

### Decision: templated trigger — Vercel Cron primary, Supabase scheduled fallback
- Spec Business rules `specs/04-communications.md:35-38`: this repo has no existing job runner — check Vercel Cron vs Supabase scheduled.
- What was checked:
  - `vercel.json:1-14` today has no `crons` property (only `buildCommand`, `outputDirectory`, `rewrites`). Project is Vercel-deployed (`api/index.ts` imports `dist/index.js`, `CLAUDE.md:9` Vercel serverless). `vercel.json` `crons` is first-class Vercel feature (`{ "crons": [{ "path": "/api/cron/messaging", "schedule": "0 2 * * *" }] }` invokes `GET /api/cron/messaging`; auth via `Authorization: Bearer $CRON_SECRET` + `x-vercel-cron: 1`).
  - `supabase_migration_production.sql:6` enables only `btree_gist`. No `pg_cron` extension, no `cron.schedule`, no Edge Function schedule. Supabase `pg_cron` requires `CREATE EXTENSION pg_cron` + plan confirmation — heavier provisioning.
  - `package.json` has no `node-cron`/`bull`/`pg-boss` runtime — zero existing job runner.
  - `server/_core/heartbeat.ts:1-33` + `server/_core/sdk.ts:323` + `docs/MANUS_OAUTH_AUDIT.md:107` are Manus-legacy artefacts with no live callers; not usable.
- Why Vercel Cron wins for v1: same artefact as tRPC server (no extra DB extension); follows `api/index.ts -> dist/index.js` bundling contract (DECISIONS 2026-08-29); auth trivial via `CRON_SECRET`/`x-vercel-cron`; Supabase `pg_cron` is documented fallback if Vercel plan cron limits (Hobby: 2 crons) block.
- Minimal v1 behaviour for T04-03 (spec Acceptance `specs/04-communications.md:47` day-before-check-in reminder): daily `0 2 * * *` UTC (=09:00 Asia/Bangkok) `GET /api/cron/messaging` loads `bookings WHERE check_in = CURRENT_DATE+1 AND status IN ('confirmed','checked_in')` via service-role client, ensures a `message_threads` row per booking, inserts `messages(thread_id, sender_user_id=NULL, body='Reminder: ...')` with idempotency `WHERE NOT EXISTS` so retries do not duplicate. Verify by seeding a booking with `check_in = tomorrow`, hitting endpoint with cron secret, asserting a row appears.

### Proposed table shape for T04-02 (recon only — not yet migrated)
```sql
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_message_threads_booking_id
  on public.message_threads (booking_id) where booking_id is not null;
create index if not exists idx_message_threads_hotel_id on public.message_threads (hotel_id);
create index if not exists idx_message_threads_hotel_created
  on public.message_threads (hotel_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_thread_created
  on public.messages (thread_id, created_at);
create index if not exists idx_messages_sender
  on public.messages (sender_user_id) where sender_user_id is not null;
```
- Why `hotel_id` denormalised on `message_threads`: thread list / RLS scopes by `hotel_id` without mandatory `bookings` join (bookings join needed only to render guest/room, not to authorize). Enforce `booking_id` hotel matches `hotel_id` via app check (`SELECT hotel_id FROM bookings WHERE id = booking_id` -> `BAD_REQUEST` if mismatch) + optional trigger.
- Why `UNIQUE (booking_id) WHERE booking_id IS NOT NULL`: one thread per booking is simplest invariant for v1 "thread attached to a booking" (`specs/04-communications.md:45`). Hotel-scoped general threads (`booking_id IS NULL`) remain unconstrained.
- Why `sender_user_id NULL` for templated: spec line 31 — null for system/templated messages.
- Why `body CHECK char_length>0` + 4000 cap: `text NOT NULL` convention elsewhere; cap prevents abuse while keeping column `text`.

### RLS sketch for T04-02
```sql
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

drop policy if exists message_threads_select on public.message_threads;
create policy message_threads_select on public.message_threads
  for select using (public.is_super_admin() or public.is_hotel_member(hotel_id));
drop policy if exists message_threads_manage on public.message_threads;
create policy message_threads_manage on public.message_threads
  for all
  using (public.is_super_admin() or public.is_hotel_member(hotel_id))
  with check (public.is_super_admin() or public.is_hotel_member(hotel_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (select 1 from public.message_threads t
            where t.id = thread_id and (public.is_super_admin() or public.is_hotel_member(t.hotel_id)))
  );
drop policy if exists messages_manage on public.messages;
create policy messages_manage on public.messages
  for all
  using (
    exists (select 1 from public.message_threads t
            where t.id = thread_id and (public.is_super_admin() or public.is_hotel_member(t.hotel_id)))
  )
  with check (
    exists (select 1 from public.message_threads t
            where t.id = thread_id and (public.is_super_admin() or public.is_hotel_member(t.hotel_id)))
  );
```
- Write path additionally enforces `requireHotelPermission(hotel_id, 'operations.view_bookings'/'operations.manage_bookings')` in tRPC before DB; `FORBIDDEN` on hotel mismatch per `specs/04-communications.md:41-42` maps via `server/routers.ts:242-244 rethrowDomainError` `42501->FORBIDDEN`.

### What remains for T04-02 / T04-03 / T04-04
- **T04-02** (tables + router): author `YYYYMMDD_add_message_threads_messages.sql` + `verify_*.sql` with DDL/RLS/indexes/`updated_at` trigger; add `server/db.ts` helpers `listMessageThreads(hotelId)`, `listMessages(threadId)`, `createMessageThread`, `createMessage`; add tRPC `listThreads`/`listMessages` (gate `operations.view_bookings`) and `sendMessage`/`createThread` (gate `operations.manage_bookings`) with `zod` validation (`body: z.string().trim().min(1).max(4000)`) + `rethrowDomainError`.
- **T04-03** (templated trigger): add `vercel.json` `crons: [{ path: "/api/cron/messaging", schedule: "0 2 * * *" }]` + Express handler `GET /api/cron/messaging` (checks `CRON_SECRET`/`x-vercel-cron`, loads tomorrow check-ins, creates threads, inserts templated messages with idempotency).
- **T04-04** (UI): replace `client/src/App.tsx:176-178` toast placeholder with real nav (likely thread drawer inside `Bookings.tsx` per `specs/04-communications.md:45-46`), gated by `can("operations.view_bookings")` for visibility and `can("operations.manage_bookings")` for composer; add `client/src/lib/routeScope.ts` entry for `/communications` under `operations.view_bookings` if top-level route chosen.

### Evidence (file:line)
- `specs/04-communications.md:6-8` Goal, `specs/04-communications.md:10-16` Non-goals (provider decision -> in-app-only), `specs/04-communications.md:17-21` Blocking-ish question -> OPEN_QUESTIONS, `specs/04-communications.md:23-27` Interface `sendMessage`/`listMessages` + reuse `operations.*`, `specs/04-communications.md:30-32` Data model `message_threads`/`messages` columns, `specs/04-communications.md:35-38` Business rules trigger Vercel Cron vs Supabase, `specs/04-communications.md:40-50` Error/Acceptance (`FORBIDDEN`, `Bookings.tsx`, day-before reminder, sidebar placeholder).
- `shared/authorization.ts:45-76` PERMISSIONS (`operations.view_bookings:62`, `operations.manage_bookings:63`); `shared/authorization.ts:85-155` ROLE_PERMISSIONS (`super_admin:90-92`, `admin:96-104`, `hotel_owner:105-127` lines 112-113, `front_desk:138-148` lines 140-141, `revenue_manager:128-137` neither, `housekeeping:149-153` neither).
- `server/db.ts:43-57` BookingRecord, `server/db.ts:208-228` listBookingsForHotel RLS pattern, `server/db.ts:332-355` createBookingWithGuests insert pattern, `server/db.ts:67-69` throwOnError.
- `supabase_migration_production.sql:58-73` bookings DDL, `supabase_migration_production.sql:12-20` hotels, `supabase_migration_production.sql:189-203` is_hotel_member, `supabase_migration_production.sql:349-352` bookings_manage RLS, `supabase_migration_production.sql:6` btree_gist only.
- `server/routers.ts:182-206` requirePermission/requireHotelPermission, `server/routers.ts:242-244` rethrowDomainError, `server/routers.ts:791-870` bookings tRPC gating.
- `vercel.json:1-14` (no crons), `package.json:6-15` (no cron dep), `client/src/App.tsx:76-78` Bookings nav, `client/src/App.tsx:176-178` Communications placeholder toast, `client/src/lib/routeScope.ts` bookings->`operations.view_bookings`, `client/src/pages/Bookings.tsx:42-46`.
- `server/_core/heartbeat.ts:1-33` + `server/_core/sdk.ts:323` + `docs/MANUS_OAUTH_AUDIT.md:107` Manus legacy cron (no live runner).

### No production code touched
Pure recon per `.agent/tickets/T04-01-communications-recon.md` — decision and report only, no `pnpm test/check/build` required.

---

## 2026-08-30 — T06-01 recon: Website Builder — Supabase Storage write path, hotel_site_config (hero_copy/accent_color/visible_sections), defer hotel_domains

### Scope & method
- Spec read: `specs/06-website-builder.md` (Goal: hotel control over `hotel_media` uploads + `hotel_site_config` hero_copy/accent_color/section visibility; Non-goals: no drag-and-drop, no automatic DNS; Data model: `hotel_media` read exists at `server/db.ts:249`, add write path, new `hotel_site_config`, decide `hotel_domains` now vs defer; Business rules: `PublicHotel.tsx` falls back to fixed copy/colors; Interface: `uploadHotelMedia`/`listHotelMedia`/`deleteHotelMedia` gated `property.manage_profile`, `saveHotelSiteConfig`/`getHotelSiteConfig`).
- Code inspection (no production code touched, recon only):
  - `server/db.ts:243-255` `getPublicHotel` read path.
  - `supabase_migration_production.sql:30-38,95-101,134,142-143,239,245,254-255,263-264,320-330,327,387-394,730,759,809` hotel_media + hotel_domains DDL/indexes/RLS.
  - `client/src/pages/PublicHotel.tsx:1-44` fixed copy, colors, media usage.
  - `server/_core/storageProxy.ts:4-48` GET-only proxy, `server/storage.ts:31-72` Forge PUT helper, `server/_core/index.ts:6,15` registration, `server/_core/env.ts:7-8` Forge env, `.env.example:1-35` env inventory, `docs/MANUS_OAUTH_AUDIT.md:275` Manus template flag.
  - `client/src/index.css:6,23` accent `--pine` values, `client/src/App.tsx:199-203,439-441` placeholder + route, `shared/authorization.ts:45-76` `property.manage_profile`.

### hotel_media — read path evidence
- `server/db.ts:243-255` `getPublicHotel(client, slug)` calls `client.rpc('get_public_hotel', { target_slug: slug }).single()` then in parallel:
  ```ts
  client.from('room_types').select('id,hotel_id,name,capacity,base_price').eq('hotel_id', hotel.id).order('base_price'),
  client.from('hotel_media').select('id,url,caption,is_hero,display_order').eq('hotel_id', hotel.id).order('display_order'),
  ```
  (`server/db.ts:250` is the exact `hotel_media` line cited in the spec). Returns `{ hotel, roomTypes, media }` where `media` is `Array<{id,url,caption,is_hero,display_order}>`.
- `client/src/pages/PublicHotel.tsx:18-20` consumes it: `const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url` and `media[index+1]?.url` per room card. No upload/delete UI exists — spec's starting point is accurate.
- DDL `supabase_migration_production.sql:30-38`:
  ```sql
  create table if not exists public.hotel_media (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references public.hotels(id) on delete cascade,
    url text not null, caption text,
    is_hero boolean not null default false,
    display_order integer not null default 0,
    created_at timestamptz not null default now()
  );
  ```
  Index `supabase_migration_production.sql:134` `idx_hotel_media_hotel_order (hotel_id, display_order)`. RLS `supabase_migration_production.sql:320-330` `hotel_media_public_select` allows public read when `h.public_enabled OR is_hotel_member`, and `hotel_media_manage` for all via `is_super_admin OR is_hotel_member`; later replaced by `hotel_media_manage_scoped` (`supabase_migration_production.sql:730,759`). No storage bucket DDL — `hotel_media.url` is currently a plain text URL, not a `storage.objects` FK.

### Storage proxy — why it does NOT already support hotel_media uploads
- `server/_core/storageProxy.ts:4-48` `registerStorageProxy(app)` does:
  ```ts
  app.get("/manus-storage/*", async (req,res) => {
    const key = (req.params as Record<string,string>)[0];
    const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/,"")+"/");
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    const { url } = await forgeResp.json() as { url: string };
    res.set("Cache-Control","no-store"); res.redirect(307, url);
  });
  ```
  Only `GET`, only `presign/get`, 307 redirect. No `PUT`/`POST` handler, no size/type validation, no `hotel_id` scoping.
- `server/storage.ts:31-72` does expose `storagePut(relKey, data, contentType)` that presigns `v1/storage/presign/put` and `PUT`s to S3, returning `{ key, url: `/manus-storage/${key}` }` — so arbitrary uploads are *possible* via the Forge helper, but this is Manus template infrastructure: `server/_core/env.ts:7-8` reads `BUILT_IN_FORGE_API_URL`/`BUILT_IN_FORGE_API_KEY`, `docs/MANUS_OAUTH_AUDIT.md:275` explicitly buckets `storageProxy.ts`/`storage.ts` as "Manus WebDev Template SDK unrelated to authentication", and `.env.example:1-35` lists Supabase/Vercel vars but leaves Forge as commented `VITE_FRONTEND_FORGE_API_*` only. Production `.env` in this repo has placeholder Supabase URLs but no Forge URL/key; the Vercel deploy has never needed Forge secrets. Using Forge would add a second provider, require new Vercel env, and produce `/manus-storage/` URLs that do not match the `hotel_media.url` Supabase-R​LS expectations.
- `todo.md:444-447` and `specs/06-website-builder.md:19-22` anticipated this: "check whether `registerStorageProxy` already supports arbitrary file uploads before adding a new storage mechanism; this was flagged as unverified — don't assume either way". Recon answer: it does not for `hotel_media`'s product needs, and the sibling `storagePut` is template legacy — choose Supabase Storage for the new write path.

### Decision: hotel_media write path = Supabase Storage
- New bucket `hotel-media` (or `hotel_media`) via Supabase Storage, not Forge. Upload flow for T06-02:
  - tRPC `uploadHotelMedia` gated `property.manage_profile` via `requireHotelPermission(hotelId, "property.manage_profile")`.
  - Server validates `file.size <= 5MB`, `contentType in ['image/jpeg','image/png','image/webp']` (reject with `BAD_REQUEST` before storage, per spec Error handling), sanitizes filename, generates `key = ${hotelId}/${uuid}-${sanitizedName}`.
  - Upload via Supabase Storage admin/service-role client `supabase.storage.from('hotel-media').upload(key, buffer, { contentType, upsert:false })` or via presigned URL for direct browser PUT if preferred — both land in `storage.objects(bucket_id='hotel-media', name=key)`.
  - On success, insert `hotel_media` row `client.from('hotel_media').insert({ hotel_id: hotelId, url: publicUrlOrSignedUrl, caption, is_hero, display_order: max+1 })` and return it. `publicUrl` is `supabase.storage.from('hotel-media').getPublicUrl(key).data.publicUrl` when bucket is public, else store `key` and resolve signed URL at read time.
  - `deleteHotelMedia` deletes `storage.objects` key then `hotel_media` row in same tRPC handler (or DB trigger), guarded by same permission.
  - RLS/bucket policy: `storage.objects` RLS `SELECT` allows public when bucket `hotel-media` and hotel is `public_enabled` (or `is_hotel_member`), `INSERT/DELETE` via `is_hotel_member(hotel_id(parsed from objects.name))` — mirror `hotel_media_manage` predicate. No extension of `registerStorageProxy` required; it stays for legacy `/manus-storage/*` GETs only.

### PublicHotel.tsx — fixed copy and colors that become configurable
- File `client/src/pages/PublicHotel.tsx:1-44` (44 lines, no props besides `slug`):
  - `PublicHotel.tsx:22-24` nav: `<a href="#stay">Rooms</a><a href="#location">Location</a><a href="#book">Check dates</a>`.
  - Hero `PublicHotel.tsx:31`: `<div class="eyebrow light">Independent hotel</div><h1>{hotel.name}</h1><p>Explore room types, rates, and availability directly from this hotel.</p><a href="#stay">View rooms</a>` + `heroImage` from `media.find(is_hero) ?? media[0]` (`PublicHotel.tsx:19`), overlay, caption `Thailand` + `{hotel.address}` (`PublicHotel.tsx:32`).
  - Intro `PublicHotel.tsx:34`: id `story`: `Stay at {hotel.name}.` + `Current property information is published directly by the hotel through its secure Channel Manager dashboard.`
  - Rooms `PublicHotel.tsx:35-37`: id `stay`: `Find your right room` + `Live room types and starting rates are managed by this property.` + `public-room-grid` mapping `roomTypes` → `media[index+1]` image, `Up to {capacity} guests · From ฿{base_price}`.
  - Booking `PublicHotel.tsx:39`: id `book`: `Plan your next visit` + `Online checkout is not enabled in this MVP. Contact the property for booking assistance.` + `Check in/Check out Select date` form + `View location` link.
  - Location `PublicHotel.tsx:40`: id `location`: `Find the hotel` + `<MapPin/> {hotel.name} {hotel.address}`.
  - Footer `PublicHotel.tsx:42`: `© {year} {hotel.name} · Property information is managed securely.`
- Colors: `client/src/index.css:23` `var(--pine): #954831` (current theme, updated from legacy `#1f6b5c` at `client/src/index.css:6`), used for `public-button` bg/text, `public-booking` bg, eyebrow `var(--pine)`, and all `brand-mark` accents. No `accent_color` prop exists yet — `PublicHotel` always renders the fixed pine. T06-03 to accept `hotel_site_config.accent_color` and apply as CSS override with fallback to `var(--pine)`.

### Decision: hotel_site_config design
- Spec `specs/06-website-builder.md:30-31` says: `hotel_site_config: hotel_id FK unique, hero_copy, accent_color, visible_sections (jsonb or fixed booleans), updated_at`. Propose:
  ```sql
  create table if not exists public.hotel_site_config (
    hotel_id uuid primary key references public.hotels(id) on delete cascade,
    hero_copy text, -- nullable; hero paragraph override, fallback is PublicHotel line 31 paragraph
    hero_title text, -- nullable; optional h1 override, fallback is hotels.name
    accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$'), -- nullable; fallback var(--pine) #954831
    visible_sections jsonb not null default '{"hero":true,"intro":true,"rooms":true,"booking":true,"location":true}'::jsonb
      check (jsonb_typeof(visible_sections)='object'),
    updated_at timestamptz not null default now()
  );
  create trigger trg_hotel_site_config_updated_at before update on public.hotel_site_config
    for each row execute function public.update_updated_at_column();
  ```
  - Why `hero_copy` single text (spec name) plus optional `hero_title`: spec names only `hero_copy`, but `PublicHotel.tsx:31` has both a title (`hotel.name`) and a paragraph (the sentence to customise). Mapping `hero_copy` to the paragraph covers the spec acceptance with minimal schema; `hero_title` is a non-breaking additive column that lets a hotel override the `<h1>` without forcing every hotel to set it — pure recon, T06-02 may keep it or merge into a single `hero_copy`.
  - Why `visible_sections jsonb` over fixed booleans: spec permits either; five section keys today (`hero|intro|rooms|booking|location` mirroring `PublicHotel.tsx:28-40` sections) but a sixth (e.g. amenity/FAQ) is plausible without a DDL migration; reads are point lookups (`hotel_id = :id`) so `visible_sections` extraction is O(1) in app code, no GIN-indexed filter needed; fixed booleans would be equally correct but less extensible for v1's "settings-driven, not free-form layout" goal.
  - Why `accent_color` `text + CHECK hex`: no `CREATE TYPE` enum precedent in this codebase — every status/color-ish column is `text+CHECK` (`supabase_migration_production.sql:54,62,480`); hex validation is a single regex, and app-layer `zod.string().regex(/^#[0-9a-fA-F]{6}$/)` mirrors it.
  - Why `hotel_id` PK (unique) not separate `id uuid PK + UNIQUE hotel_id`: one config row per hotel is the product invariant — PK on `hotel_id` enforces it without an extra index, matching `room_housekeeping_status(room_id PK)` pattern (`supabase_migration_production.sql:480`).
- RLS sketch for T06-02:
  ```sql
  alter table public.hotel_site_config enable row level security;
  drop policy if exists hotel_site_config_public_select on public.hotel_site_config;
  create policy hotel_site_config_public_select on public.hotel_site_config for select
    using (exists (select 1 from public.hotels h where h.id=hotel_id and (h.public_enabled or public.is_hotel_member(h.id))));
  drop policy if exists hotel_site_config_manage on public.hotel_site_config;
  create policy hotel_site_config_manage on public.hotel_site_config for all
    using (public.is_super_admin() or public.is_hotel_member(hotel_id))
    with check (public.is_super_admin() or public.is_hotel_member(hotel_id));
  ```
  App-layer additionally gates `saveHotelSiteConfig`/`uploadHotelMedia` on `property.manage_profile` via `requireHotelPermission`; `getHotelSiteConfig`/`listHotelMedia` public read follows `get_public_hotel` pattern for anonymous `PublicHotel`.

### Decision: defer hotel_domains (with DECISIONS note, not silent skip)
- `supabase_migration_production.sql:95-101`:
  ```sql
  create table if not exists public.hotel_domains (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references public.hotels(id) on delete cascade,
    domain text not null unique, verified boolean not null default false,
    created_at timestamptz not null default now()
  );
  ```
  Indexes `supabase_migration_production.sql:142-143` `idx_hotel_domains_hotel_id` + `idx_hotel_domains_verified where verified=true`, RLS `supabase_migration_production.sql:387-394` `hotel_domains_public_select (verified OR is_super_admin OR is_hotel_member)` + `hotel_domains_manage (is_super_admin OR is_hotel_member)` (`736,809` scoping variant). Existing gap `todo.md:449-452` confirms zero app code references — verified via repo grep `hotel_domains` only hits migrations/specs/docs.
- Spec `specs/06-website-builder.md:9,15-16,32-36` Non-goals explicitly say "Automatic DNS provisioning — custom domain support (if attempted) still requires the hotel to configure DNS themselves; this phase at most handles Vercel-side domain verification" and `specs/06-website-builder.md:32-36` instructs: "decide during this phase's own recon whether to build custom domains now or defer it as a separate follow-up spec; it's schema-ready but entirely unimplemented, larger in scope (Vercel domain API + verification flow) than the media/config work above. Default to deferring it and shipping media+config first, unless the human says otherwise."
- Implementation scope if built now: Vercel Domains API (`POST /v9/projects/{id}/domains { name: domain }` + polling `GET /v6/domains/{domain}/config` for `verification`/`cname`/`txt` challenges), persisting `verified` after `dig TXT _vercel.domain` passes, and changing `PublicHotel` resolution from slug `/:slug` (`client/src/App.tsx:439-441`) to host-based `req.headers.host -> hotel_domains.domain -> hotel_id -> getPublicHotel(hotel.slug)`. This is a separate deployment/DNS verification track, larger than the CRUD+storage work for media/config.
- Decision: **defer** — T06-02/T06-03 ship `hotel_media` write + `hotel_site_config` only; this DECISIONS entry (`## 2026-08-30 — Website Builder: ... defer hotel_domains`) satisfies spec Acceptance `specs/06-website-builder.md:52-53` "Custom domains either shipped in this pass or explicitly deferred with a note in DECISIONS.md — not silently skipped". A follow-up spec can implement domains when Vercel plan domain limits are confirmed. Placeholder `client/src/App.tsx:199-203` `toast.info("Website Builder module is coming soon")` remains until T06-04 replaces it.

### What remains for T06-02 / T06-03 / T06-04
- **T06-02** (migration + storage + media tRPC): author `YYYYMMDD_add_hotel_site_config_and_media_bucket.sql` + `verify_*.sql` (create `hotel_site_config` + `updated_at` trigger + RLS + `hotel-media` bucket `insert into storage.buckets (id, name, public) values ('hotel-media','hotel-media', true)` + `storage.objects` RLS), add `server/db.ts` helpers (`listHotelMedia`, `getHotelMediaForHotel`, `createHotelMedia`, `deleteHotelMedia`, `getHotelSiteConfig`, `upsertHotelSiteConfig`), add tRPC `uploadHotelMedia` (multipart/base64, 5MB image/jpeg|png|webp, `BAD_REQUEST` on violation, Supabase Storage upload, `hotel_media` insert, `is_hero`/`display_order` handling), `listHotelMedia`, `deleteHotelMedia`, `setHeroMedia` — all gated `property.manage_profile` via `requireHotelPermission` + `rethrowDomainError` mapping.
- **T06-03** (site config + PublicHotel fallback): tRPC `getHotelSiteConfig` (public, falls back to `null`) + `saveHotelSiteConfig` (gated `property.manage_profile`, zod `hero_copy: z.string().max(400).nullable()`, `accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()`, `visible_sections: z.object({hero:z.boolean(),intro:z.boolean(),rooms:z.boolean(),booking:z.boolean(),location:z.boolean()}).partial()` ), extend `getPublicHotel` to also return `siteConfig` (or separate public query), update `PublicHotel.tsx:31,34,36,39,40` to read `siteConfig` with fallbacks to today's fixed strings/colors and to conditionally render each section based on `visible_sections`.
- **T06-04** (UI): replace `client/src/App.tsx:199-203` toast with real `/hotels/:id/website-builder` route (or `/settings/website`), gated `property.manage_profile`, with media grid (upload/delete/set-hero/reorder) + hero copy input + color picker + section toggles; add `client/src/lib/routeScope.ts` permission mapping; tests `server/hotelMedia.test.ts`/`server/hotelSiteConfig.test.ts` per spec Test plan.

### Evidence (file:line)
- `server/db.ts:243-255` `getPublicHotel` RPC + parallel selects, `server/db.ts:250` exact `hotel_media` read.
- `supabase_migration_production.sql:30-38` `hotel_media` DDL, `supabase_migration_production.sql:134` `idx_hotel_media_hotel_order`, `supabase_migration_production.sql:239` RLS enable, `supabase_migration_production.sql:320-330` `hotel_media_public_select`|`hotel_media_manage`, `supabase_migration_production.sql:730,759` `hotel_media_manage_scoped`, `supabase_migration_production.sql:95-101` `hotel_domains` DDL, `supabase_migration_production.sql:142-143` `hotel_domains` indexes, `supabase_migration_production.sql:245,263-264,387-394,736-809` `hotel_domains` RLS.
- `specs/06-website-builder.md:6-53` full spec (Goal `6-9`, Non-goals `11-16`, Interface `19-25`, Data model `28-36`, Business rules `39-41`, Acceptance `48-53`).
- `client/src/pages/PublicHotel.tsx:1-44` fixed copy/colors/media (`PublicHotel.tsx:18-20` heroImage, `PublicHotel.tsx:31` hero eyebrow+title+paragraph, `PublicHotel.tsx:34` intro, `PublicHotel.tsx:36` rooms, `PublicHotel.tsx:39` booking, `PublicHotel.tsx:40` location).
- `server/_core/storageProxy.ts:4-48` Forge proxy (GET only `server/_core/storageProxy.ts:5`, presign `server/_core/storageProxy.ts:18-22`), `server/storage.ts:31-72` `storagePut`, `server/_core/index.ts:6,15` registration, `server/_core/env.ts:7-8` Forge env, `.env.example:1-35` no Forge, `docs/MANUS_OAUTH_AUDIT.md:275` Manus template flag.
- `todo.md:444-458` Phase F gap (hotel_media read exists, hotel_domains unused, Website Builder placeholder).
- `shared/authorization.ts:45-76` `PERMISSIONS` (`property.manage_profile:53` etc.), `shared/authorization.ts:85-155` `ROLE_PERMISSIONS` matrix.
- `client/src/App.tsx:199-203` Website Builder placeholder toast, `client/src/App.tsx:439-441` `/:slug` PublicHotel route, `client/src/index.css:6,23` `var(--pine)` `#1f6b5c`→`#954831`.

### No production code touched
Pure recon per `T06-01` — decision and report only, no `pnpm test/check/build` required.

