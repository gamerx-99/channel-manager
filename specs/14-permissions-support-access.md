# 14 Per-person permissions, support access, and platform-role hardening

Status: IN PROGRESS — 14-00 (RLS write hardening) and 14-01 (core authorization)
committed on `agent-a/next` (2026-10-27), not yet pushed to `main`. 14-02 CANCELLED
by owner decision (2026-10-27); its D1 schema moves to 13-02 and enforcement to
13-03. 14-03..14-05 remain pending and are tracked separately.
Depends on: 12 (SaaS plans/billing) for plan-gated SlipOK quotas (14-05); spec 13 for
eventual port to the Cloudflare data layer.
Owner-tier: cross-cutting (shared authorization + server + client + SQL).

## Why

Two security holes found during the spec 14 RLS inventory:

1. A hotel owner could insert/update a `hotel_users` row with role `admin` (only
   `super_admin` was blocked), and `is_platform_admin()` then opened every hotel's
   bookings, guests and passport data to that account. An owner could also delete a
   platform account's anchor row pointing at their hotel.
2. Several write policies used `is_hotel_member()`, so any member (housekeeping
   included) and the read-only platform admin could write directly through PostgREST:
   PromptPay settings (where guest money is sent), payment sessions, booking services,
   rate overrides, housekeeping tasks, message threads/messages, and the service catalog.

Plus the product gap: permissions were role-only and all-or-nothing. Owners need to
switch whole groups on/off per person, and hayhost support needs time-limited,
owner-approved access to a hotel without cross-hotel read.

## Tickets

- [x] **14-00 RLS write hardening (urgent)** — migration
  `20261027_rls_write_hardening.sql` + verify. Closes both holes: platform roles
  (`super_admin`/`admin`/`support`) can no longer be written by hotel staff; every
  hardened write now uses the matching `can_manage_*` helper. No data changes.
  Commit: `fix(db): close RLS write gaps and platform-role escalation (spec 14-00)`.
- [x] **14-01 Core authorization (this commit)** —
  - `shared/permissions.ts`: 13 permission toggles, per-person grants/revokes,
    role-templated overrides, toggle dependency closure, owner-only switches, support
    grants (1/24/72/168h, read-only or edit, `property.manage_staff` excluded).
  - `shared/authorization.ts`: add `support` role, `CROSS_HOTEL_READ_ROLES`
    (`super_admin`, `admin` only — support has no cross-hotel read),
    `operations.cancel_bookings` permission, `PermissionMembership` with resolved
    permissions, `hasHotelPermission` honours stored permissions.
  - `server/supabase.ts`: legacy Postgres permission data source; its permission
    fields move to D1 under 13-02 and 13-03.
  - `server/routerUtils.ts`, `server/routers/staffRouter.ts`: thread permissions
    through; allow `support` as an assignable role.
- [x] **14-02 Postgres RLS changes CANCELLED** — owner decision (2026-10-27): Supabase will be deleted after the Cloudflare migration, so no Postgres RLS changes will be applied. The `permission_grants`/`permission_revokes` and `support` role data model belongs in D1 ticket 13-02; permission and support-grant enforcement belongs in Cloudflare ticket 13-03. Any migration under the old Supabase design is superseded.
- [ ] **14-03 Server work** — permission switch system + support keys endpoints,
  super-admin dashboard, fix `completeHotelOwnerSignup` to use the logged-in user id,
  fix `verifySlip` to use the session hotel and check the payee account, fix
  `deleteRateOverride` to check same hotel.
- [ ] **14-04 Client** — per-staff permission switch UI and owner approval screen for
  support access.
- [ ] **14-05 SlipOK central account** — auto key rotation on quota exhaustion, own
  duplicate-slip check, plan-based quotas.

## Non-goals / invariants

- `property.view_financials` stays `hotel_owner`-only and is never granted to
  `super_admin` (see `requirePermission`, not `requireHotelPermission`).
- `property.manage_staff` is never part of a support grant.
- Support reaches a hotel only through an owner-approved, time-limited grant.
- `inviteAuthUser.test.ts` has 4 pre-existing failures (missing Supabase creds) —
  not caused by this work.

## Known gaps not addressed here

- Several procedures still lack permission checks: `hotels`, `dashboard`,
  `channelPerformance`.
- `auth.me` returns an `accessToken`.
- `markRead` does not verify the notification belongs to the hotel.
- `savePromptPayId` has no MFA step-up.
