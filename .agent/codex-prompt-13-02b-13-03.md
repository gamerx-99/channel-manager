# Codex prompt — 13-02b schema additions + 13-03 scoped data layer

Folder: C:\WORK\channel-manager-c   Branch: agent-c/d1-schema
The orchestrator reviewed 13-02 (49e54bb): 28 tables, parity test passes, `pnpm check` is clean. Approved.

---- PASTE BELOW THIS LINE ----

Two tickets, in order, on branch agent-c/d1-schema in C:\WORK\channel-manager-c. Do not push, deploy or merge. Never read `.env`. Do not touch `client/src/` (another agent owns it) or any Supabase `.sql` file at the repo root.

## Ticket 13-02b — schema additions (owner decisions 2026-10-28), separate commit
Add to `drizzle/d1-schema.ts` and generate a NEW drizzle migration in `drizzle/d1/`. Do not edit the initial migration.
1. `hotels`:
   - `acquisition_source` text NOT NULL default 'direct', with CHECK in ('direct','referral','agent').
   - `referred_by_hotel_id` text NULL, FK hotels.id.
   - `agent_id` text NULL.
   - Purpose: the referral program and agent commission later. No logic yet.
2. `agents` table: id, name, phone, email, status ('active','inactive'), created_at. `hotels.agent_id` gets an FK to it. Agents earn commission only for months the hotel actually pays (no logic yet, schema only).
3. `bookings`:
   - Add `marketing_consent` integer(boolean) NOT NULL default 0 and `marketing_consent_at` text NULL.
   - Purpose: PDPA opt-in on the public booking form.
4. Extend `server/d1SchemaParity.test.ts`, or add a new test, so these columns and tables are asserted. The test must fail before your change.

## Ticket 13-03 — hotel-scoped data layer + tenancy test suite
Follow `specs/13-cloudflare-migration.md` (13-03) and `specs/14-permissions-support-access.md`.
- A data-access layer over D1/Drizzle in which every hotel-data function takes the caller context and resolves permissions with `resolveMembershipPermissions` (shared/permissions.ts) before reading or writing.
- **No query path may return hotel-internal data to super_admin.** Super admin gets only a platform view: hotel name, plan, payment status, room count and sync status.
- Support role: access only through an active, unexpired `support_access_grants` row. View-only vs edit scope is enforced. Every access writes `support_access_log`.
- A tenancy test suite (in-memory SQLite) proving:
  - A member of hotel A cannot read or write hotel B.
  - A staff member without a toggle is denied.
  - Super admin is denied hotel bookings, guests and financials.
  - Support is denied without a grant, allowed with one, denied after expiry, and an edit is denied on a view-only grant.
  - Nobody can edit their own permissions.
  - Non-owners cannot grant `financials` or `staff`.
- **Do NOT port these** (owner decisions):
  - `channelPerformance` (server/routers/dashboardRouter.ts). The page is being removed.
  - The synthetic-success fallback in `saveHotelSiteConfig` (server/db/siteConfig.ts:59). On D1 the table always exists, so an error must surface as an error.
- Money: integer satang or decimal-safe arithmetic, never float. Write it as a tested helper.

## Definition of done (each ticket)
- `pnpm test`: paste the pass/fail counts. The passed count must rise above 620. The only acceptable failures are the 7 known credential-env tests (4 inviteAuthUser + 3 Supabase credential tests).
- `pnpm check` and `pnpm build`: paste the result.
- A conventional commit per ticket, e.g. `feat(db): add acquisition source, agents and marketing consent (13-02b)`.
- A `.agent/handoff.md` entry per ticket, and update the Status line in specs/13.
- If anything in the spec conflicts with this prompt, stop and write it in `.agent/OPEN_QUESTIONS.md` instead of guessing.
