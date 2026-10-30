# Access-control review: `agent-s/support-access` (tickets 14-03b / 14-04)

- Reviewed branch: `agent-s/support-access` at `80e3f7a`, compared with base `6f99870`
- Review branch: `cloud/access-review`. It adds this report and `server/cloudAccessReview.test.ts`.
- Date: 2026-10-30
- Method: I read every protected tRPC procedure and the repository function each one
  calls. I then ran probes through the real `appRouter`, with a session context built
  by `createContextFromRequest` on an in-memory D1 database migrated from
  `drizzle/d1/*.sql`. A finding is listed only when a test reproduces it. I did not
  change any application code.

## Summary

Hotel isolation for support, `super_admin` and `admin` holds: I found no way for any of
them to read or change another hotel's data. Both defects I proved are in the
support **audit trail**, not in access enforcement.

| # | Severity | Area | Proving test |
|---|----------|------|--------------|
| 1 | Low–Medium | Support audit log stores raw, pre-validation, unbounded input values. This works against any hotel, without a grant. | `server/cloudAccessReview.test.ts` › "does not store unvalidated or unbounded request values in another hotel's audit log" |
| 2 | Low | Support denials of procedures that have no hotel id in their input are never audited | `server/cloudAccessReview.test.ts` › "records support denials of platform and cross-hotel procedures" |

Both tests use `it.fails`. Each one asserts the safe behaviour, so it fails today, and
`it.fails` turns that failure into a pass so the suite stays green. After a fix, vitest
flags the test, and it should then be changed to `it` so it stays as a regression test.
I ran both as plain `it` first and confirmed that each fails on its assertion, not on
setup:

```
AssertionError: expected 'denied:payment.manualVerify:{"hotel_i…' not to contain 'OWNER APPROVED THIS BY PHONE'
AssertionError: expected false to be true // Object.is equality
```

---

## Finding 1: support audit log stores unvalidated, unbounded request values in any hotel's history

- **Severity:** Low–Medium. This is about audit integrity and storage. No hotel data is
  exposed.
- **Where:** `server/d1/supportAccess.ts:116-117`, called from `server/_core/trpc.ts:64`
  (`await opts.getRawInput()`).
- **What happens:** `logSupportProcedure` keeps the allow-listed identifier keys
  (`booking_id`, `room_id`, `thread_id`, …) but takes their values from the raw input
  before Zod has run. The only check is `typeof value === "string"`, with no format or
  length limit. The row is written for any hotel id that exists, whether or not the
  support account has ever held a grant there.
- **Reproduction:** A `support` account with no grant for hotel B calls
  `payment.manualVerify({ hotel_id: B, booking_id: "OWNER APPROVED THIS BY PHONE xxxx…(20 000 chars)", approved: true })`.
  Zod rejects the input with `BAD_REQUEST`. Even so, hotel B's `support_access_log` gets a
  row whose `action` is 20 119 characters long and contains the forged sentence. The
  owner sees that text on `/hotels/B/support-access`, because `listSupportAccess` returns
  the whole log with no limit.
- **Impact:** The audit trail exists to watch support accounts, and those same accounts
  can write free text of any length into any hotel owner's history without a grant.
  Repeated calls can bloat both the table and the owner's audit page. Guest data
  doesn't leak from the database this way. However, any guest detail that a client
  places in an identifier field is stored verbatim, because nothing validates it.
- **Suggested fix:** Log only values that pass the procedure's own schema. One way is to
  move the audit into a middleware placed after `.input()` and read the parsed `input`.
  Another is to validate each identifier as a UUID (or the known provider enum) and log
  `"<invalid>"` otherwise. Cap `action` at a fixed length, and paginate or limit
  `listSupportAccess`.

## Finding 2: support denials on procedures without a hotel id leave no audit record

- **Severity:** Low. The denial itself works and nothing is exposed. The gap is the
  "every support access, including denials, is logged" requirement.
- **Where:** `server/d1/supportAccess.ts:77` (`if (typeof hotelId !== "string") return;`).
  This ties into `support_access_log.hotel_id` being `NOT NULL`
  (`drizzle/d1-schema.ts:479`).
- **Reproduction:** A `support` account calls `access.platformSummary()`,
  `channelManager.financials()`, `staff.adminUsers()` and `notifications.list({})`. All
  four return `FORBIDDEN`, and `support_access_log` is still empty afterwards.
- **Impact:** A support account probing platform-wide or global endpoints leaves no
  trace. The log only records attempts that name a hotel.
- **Suggested fix:** Add a platform-level audit table for support denials that have no
  hotel (or make `hotel_id` nullable in a new migration plus verify script). Write to it
  whenever `hotelId` cannot be resolved. Hotel owners keep seeing only their own rows.

---

## Areas checked and found clean

Each item below was checked by reading the code and, where noted, by a probe through
the real router. I deleted the probe file afterwards; only the proving tests are
committed.

1. **Support without an active grant, or after expiry or revocation.** Every protected
   procedure either goes through `authorizeHotelAction` → `resolveScope`
   (`server/db/scope.ts`), or is a platform procedure gated by `authorizePlatformAction`
   (super_admin only). For a support identity, `resolveScope` uses only grants that
   have not been revoked and satisfy `expiresAt > now` (`scope.ts:83` onwards). It never
   uses a real membership row. The context projection
   (`getSupportMemberships`, `context.ts:182`) is rebuilt on every request. Repositories
   re-check against D1 anyway, so a stale projection cannot write: the existing
   `manualVerify` stale-projection test covers this. The aggregate procedures
   (`hotels`, `dashboard`, `dashboardCalendar`, `ota.summary`) iterate only the
   support grants.
2. **View-only support writing.** Probe with a view key: `notifications.markAllRead`,
   `slipok.savePromptPayId`, `createBooking`, `access.updateStaffPermissions`,
   `staff.inviteHotelStaff`, `access.grantSupport`, `ota.triggerSync` and
   `saveHotelSiteConfig` all returned `FORBIDDEN`. The only writes gated on a view
   permission are the two notification mutations, and `readOnlyWrite` blocks them
   (`scope.ts:123`).
3. **Support getting `manage_staff`, `manage_support_access` or
   `transfer_ownership`.** All three are in `SUPPORT_EXCLUDED_PERMISSIONS`
   (`shared/permissions.ts:221`). `resolveMembershipPermissions` ignores stored grants of
   the two reserved permissions. Probe with an edit key:
   `updateStaffPermissions`, `inviteHotelStaff`, `hotelStaff`, `grantSupport`,
   `supportAccess` and `transferHotelAdmin` all returned `FORBIDDEN`.
4. **Hotel A reaching hotel B, including through resource ids.** Every repository
   filters the resource id by `hotel_id`: room types, services, media, rate overrides,
   availability, housekeeping tasks/rooms/bookings/assignees, threads/messages, booking
   transitions, `createBooking.room_id`, OTA room targets, and staff membership
   update/remove/transfer. Probe: an edit key for A calling
   `manualVerify({ hotel_id: A, booking_id: <B's booking> })` returned `NOT_FOUND`, and
   `bookings(B)` returned `FORBIDDEN`.
5. **`super_admin` / `admin` reaching hotel data, and what support's
   `platform.view_all_hotels` exposes.** Probe as `super_admin` and as `admin`:
   `hotel(B)` and `bookings(B)` returned `FORBIDDEN`; `hotels` and `dashboard` returned
   empty; `notifications.list({})` returned `[]` (super_admin) or `FORBIDDEN` (admin).
   `platformSummary` returns only name, room count and sync status. No server gate uses
   `platform.view_all_hotels`. For support, the permission only opens the client
   `/hotels` route, and the server feeding that route lists granted hotels only.
6. **Staff escalation through invites, role changes or toggles.**
   `assertStaffPermissionChange` / `checkPermissionEdit` bound invites, assignments,
   role-template changes, removals and toggle edits to the actor's own permissions.
   They reject owner-only and owner-reserved switches, self-edits, and targets that
   outrank the actor. Transfer requires `property.transfer_ownership`, which only the
   owner holds. The existing tests plus a router probe confirm this.
7. **Guest data in `support_access_log` for legitimate calls.** Only the action name and
   allow-listed identifier keys are written, and request bodies such as
   `guest_name`/`passportNo` are dropped. The weakness is the unvalidated values in
   Finding 1.
8. **Mixed identity (support plus a real membership).** It fails closed. Probe: support
   that is also `hotel_owner` of B gets `FORBIDDEN` on `hotel(B)`, `bookings(B)`,
   `financials` and `grantSupport(B)`, and sees only its granted hotel A, read-only.
   There is no leak. The cost is that such an account loses its own hotel, which is
   availability rather than security.
9. **Weakened test assertions.** I diffed every test file changed since `6f99870`. Each
   change replaces a retired super_admin bypass assertion with a `FORBIDDEN` assertion
   that also checks the repository was never called; the spec expects this. The
   not-found tests keep their assertions and now use owner fixtures. The
   `HotelStaff.test.tsx` fixture gained `memberships`, which the UI now reads. The
   toggle-coverage test excludes the two new reserved permissions, as their definition
   requires. I found no deleted tests and no loosened matchers.

## Observations (not defects; your call)

- **Edit-mode support can change payment destinations.** An edit key includes
  `property.manage_profile`, which gates `slipok.savePromptPayId` and the SlipOK key
  endpoints. Today only the MFA step-up stands in the way (`slipokRouter.ts:73`).
  Spec 14 excludes only staff and owner controls from support. If PromptPay/SlipOK
  should be owner-only, that needs a spec decision.
- **`staff.adminUsers` (super_admin) returns every hotel's staff membership list**
  (user ids, roles, hotel names) through `listHotelUserAssignments`. This predates this
  branch and is user management rather than guest data. Still, it goes beyond the
  "summary-only platform data" described for the 14-03 dashboard.
- **The view key includes `property.view_financials`**, so support sees booking prices.
  This predates the branch (`SUPPORT_VIEW_PERMISSIONS` at `6f99870`).

## Could not check

- Behaviour against real Cloudflare D1 or a real Better Auth session. All runs used
  `node:sqlite` with migrations applied and a stubbed `auth.api.getSession`.
- Client-side rendering in a browser. I reviewed `routeScope.ts`, `SupportAccess.tsx`
  and `StaffPermissionToggles.tsx` by reading only. The server enforces every gate they
  mirror.
- Public and payment flows (`payment.createSession/checkStatus/verifySlip`), which the
  spec already lists as known gaps for 14-03.

## Evidence

`pnpm test` on `cloud/access-review` (Node v22.22.0):

```
 FAIL  server/otaIcal.d1.test.ts > GET /api/ical/:file (D1) > serves the room calendar for a valid token
 FAIL  server/d1/booking.test.ts > D1 booking repositories > updates occupancy config only inside scope and preserves child-rule switch behavior
 FAIL  server/d1/hotel.test.ts > D1 hotel repository > reads and mutates hotel, room, and service data within the caller's scope
 Test Files  3 failed | 113 passed (116)
      Tests  3 failed | 841 passed (844)
```

The same three tests also fail on the untouched base `6f99870`: 3 failed / 27 passed
across those three files, run in a separate worktree. They are environmental and not
caused by this branch or by the review tests. Two fail because `node:sqlite` cannot
bind a parameter type ("Provided value cannot be bound to SQLite parameter"), and one
iCal test depends on the date. The suite is otherwise green, and both review tests pass
as `it.fails`. The agents reported "842 tests passing", which I could not reproduce in
this environment.

`pnpm check`: `tsc --noEmit` exited 0 with no errors.
