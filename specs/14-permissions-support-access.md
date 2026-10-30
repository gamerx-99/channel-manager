# 14 Per-person permissions, support access, and platform-role hardening

Status: IN PROGRESS — 14-03b server and 14-04 client implemented in
`agent-s/support-access` (2026-10-30), 842 tests/check/build passing and independent
reviewer APPROVE; uncommitted per instruction.
14-00/14-01 are historical completed work; 14-02 remains CANCELLED. This run does
not close the full 14-03 parent or start 14-05.
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
  - **14-03b DONE locally, reviewer APPROVE (2026-10-30)**: `access` router for stored staff
    permissions, owner support grants/revoke/audit, and summary-only platform data.
    D1 grants are account-bound (no bearer-token exchange), exactly 1/24/72/168h,
    view/edit; reserved owner controls never delegate. Aggregate OTA/notification
    paths and payment-review writes now honour persisted scope. Delegated role,
    invite, removal and ownership paths cannot bypass permission switches.
- [x] **14-04 Client** — per-staff permission switch UI and owner approval screen for
  support access.
- [ ] **14-05 SlipOK central account** — auto key rotation on quota exhaustion, own
  duplicate-slip check, plan-based quotas.

## Non-goals / invariants

- `property.view_financials` is held by `hotel_owner`, and the owner alone decides
  which staff get it through the per-person switch (owner decision, 2026-10-31). It
  never reaches `super_admin`, and a support key never opens the financial report
  (see `requireFinancialsAccess`, not `requireHotelPermission`).
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


## Support accounts by email (owner decision, 2026-10-31)

- A super admin enters an email on `/settings/admin-users`. The invitee accepts on the
  existing `/accept-invite` page, and only then does the account work. The account lives
  in `support_accounts` (migration `20261031000000_support_accounts.sql`) because support
  belongs to no hotel. A super admin can disable it.
- A hotel owner grants the time-limited key by typing that support email, not a user id.
  Owners cannot create support accounts.
- ASSUMPTION: an email that already has an account is refused, because support identity
  removes all hotel access by design.
- Sending needs `RESEND_API_KEY` and `EMAIL_FROM` on the Worker. Without them
  `createEmailSender` falls back to the mock sender and no email leaves.

## Platform super admins (owner decision, 2026-10-31)

- A super admin belongs to no hotel, so the account lives in `platform_admins`
  (migration `20261031010000_platform_admins.sql`), and the session gains the
  `super_admin` role once the invite is accepted and the row is not disabled.
- ASSUMPTION: the app has no screen that creates a super admin. A `platform-invite:<email>`
  link is created by hand in D1, so no request can mint this role.
- The role still never opens a hotel or the financial report.

## 14-03b / 14-04 local delivery notes (2026-10-30)

- `access.updateStaffPermissions`, `grantSupport`, `revokeSupport`, `supportAccess`,
  `platformSummary` reuse D1 scope and existing support tables; no migration added.
- `/hotels/:id/staff` renders the 13 shared switches with dependency closure and
  edit bounds. `/hotels/:id/support-access` is owner-only and shows keys and audit
  history. Support mode/expiry appears in the shell. `/platform` (also the super-admin
  dashboard entry) shows only hotel name, plan, payment status, room count and sync
  status. Billing fields remain null until spec 12, per the existing owner decision.
- Routing and navigation use the selected hotel's resolved membership, without
  cross-hotel role inheritance. The financial dashboard opens for the owner and for
  staff with the owner's switch on, and it lists only the hotels where that holds.
- Existing tests asserting the retired super-admin hotel bypass are replaced with
  stronger FORBIDDEN/no-repository-call checks. Not-found tests retain their
  assertions with authorized owner fixtures. This implements the explicit security
  requirement, rather than preserving obsolete mocked access behavior.
- Validation and reviewer evidence: `.agent/tickets/T14-03b-support-access.md`,
  `.agent/tickets/T14-04-per-staff-ui.md` and the latest handoff entries.
