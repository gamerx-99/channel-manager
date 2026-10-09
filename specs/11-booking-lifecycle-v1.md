# 11 Booking Lifecycle v1 — held / pending_payment state machine
Status: v1 COMPLETE AND LIVE. Front-desk Phase 2 check-in/out code is prepared; its migration
and verify script still require human application and confirmation. All sub-phases (A–F) done in code and both migrations
(`20260910_booking_lifecycle_v1.sql`, `20260911_add_hotel_services_catalog.sql`) applied to
production — human confirmed 2026-09-03, every row of both verify scripts (20 checks total)
returned PASS. The public booking wizard is fully operational end to end.
Depends on: 05-direct-booking-engine, 01-payments-slipok

## Goal
Replace the current public-booking behaviour that creates a `confirmed` row
before payment with a proper state machine:

`held` → `pending_payment` → `pending_verification` → `confirmed`

and release inventory automatically when a hold or payment window expires,
without relying on a cron job.

## Non-goals
- Refund flow UI (handled later)
- Guest portal / accounts

## Front-desk Phase 2 transitions
- Staff with `operations.manage_checkin_checkout` for the selected hotel can move
  `confirmed` → `checked_in` → `checked_out` using the existing lifecycle edges.
- The server validates the hotel permission; one database transaction locks and
  updates the booking and appends its `booking_status_log` audit row.
- The additive transition RPC migration must be applied and its verify script
  confirmed by the human before these actions are considered live.

## Interface contract
- Pure state-machine helpers live in `shared/bookingLifecycle.ts` and are the
  single source of truth for legal transitions and inventory occupancy.
- Lazy expiry: every read/write path that cares about inventory calls
  `expireBookingIfPast` (or applies `isBookingOccupyingInventory`) at query time
  using `Date.now() > expires_at`. No background sweep.
- New public tRPC procedures in `server/routers/bookingRouter.ts`:
  - `booking.holdRoomType` — anonymous, creates a `held` booking with a room
    assigned and an `expires_at`.
  - `booking.confirmBookingDetails` — anonymous, moves a held booking to
    `pending_payment` and refreshes `expires_at`.
- Existing `createPublicBooking` stays in place until sub-phase E replaces the
  client flow.

## Data model
- Migration `20260910_booking_lifecycle_v1.sql` widens `bookings.status`, adds
  `expires_at` / `payment_method` / `late_payment` / `created_by`, adds
  `hotel_payment_settings.hold_timeout_minutes`, extends
  `payment_sessions.raw_response` / `verified_transaction_ref`, creates
  `booking_status_log`, and widens `prevent_double_booking` to cover the new
  pre-confirmation statuses.

## Business rules
- A booking occupies inventory when:
  - `status = 'confirmed'` or `status = 'checked_in'` (regardless of `expires_at`), or
  - `status` is `held` / `pending_payment` / `pending_verification` AND
    `expires_at` has not passed.
- Transitions outside `ALLOWED_TRANSITIONS` are rejected by
  `assertValidTransition`.
- `confirmBookingDetails` must call `expireBookingIfPast` first; if the hold has
  expired it returns `PRECONDITION_FAILED`.
- `holdRoomType` must pick a room that is not occupied per the rule above and
  must handle the exclusion-constraint race with a friendly "no longer
  available" message.

## Sub-phases
(Lettering matches the master plan at `C:\Users\GAMER\.claude\plans\bubbly-foraging-deer.md` — G, the
i18n sweep, was done first and tracked separately in `.agent/handoff.md`.)
- [x] A — schema migration (both `20260910_booking_lifecycle_v1.sql` and `20260911_add_hotel_services_catalog.sql` applied to production 2026-09-03; verify scripts confirmed all-PASS by the human)
- [x] B — core state machine + lazy expiry + `holdRoomType` + `confirmBookingDetails`
- [x] C — slip verification hardening + manual review (`verifySlip` never auto-fails on SlipOK API failure, duplicate transaction ref guard, raw response audit, `payment.manualVerify` staff procedure)
- [x] D — `hotel_services` catalog table + admin CRUD page
- [x] E — retire `createPublicBooking` in favour of the hold flow; restructure the public booking page into the locked 6-step wizard with the 3-click calendar and a services step (E1 calendar component done; E2 wizard restructure complete)
- [x] F — walk-in flow: `payment_method` field on staff-created bookings

## Acceptance criteria
- [x] `shared/bookingLifecycle.test.ts` covers transitions, expiry, and inventory rules.
- [x] `getPublicHotelAvailability` no longer counts expired holds as occupied.
- [x] `createPublicBooking`'s own availability check uses the same occupancy rule.
- [x] New tRPC procedures are rate-limited public mutations with full input validation.
- [x] `payment.verifySlip` falls through to manual review on SlipOK API failures, persists raw response + transaction ref, and guards against duplicate refs.
- [x] `payment.manualVerify` is a staff-only mutation gated on `operations.manage_bookings`.
- [x] Staff bookings table surfaces all lifecycle statuses and offers approve/reject actions for `pending_verification`.

## Booking party-size persistence (2026-10-10)
- Staff-created bookings capture adult count and each child's age or height based on the selected room type rule.
- Public step ① writes the adult count and each child's measurement to the held booking; booking list/check-in context reads and displays the persisted values.
- TM.30 remains mapped from named guest identity records; party counts do not create anonymous export rows.
- `20261010_booking_guest_counts.sql` and `verify_20261010_booking_guest_counts.sql` are prepared. Owner must apply the migration and confirm every verification row is PASS before this database change is considered live.
- [x] `pnpm check`, `pnpm test`, and `pnpm build` pass for the local implementation.
- [ ] Owner applies and verifies the guest-count migration in the production SQL editor.

## Test plan
- `shared/bookingLifecycle.test.ts` — pure state-machine tests.
- Existing `server/publicBooking.test.ts` — availability logic regression cover.
- Future: mocked-router tests for `holdRoomType` and `confirmBookingDetails`
  permission/rate-limit boundaries.

## Definition of Done
- [x] `pnpm test`, `pnpm check`, `pnpm build` all pass
- [x] No stray TODO/FIXME left in touched files (one intentional TODO referencing sub-phase E remains)
- [x] Spec status updated and `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence
