# 11 Booking Lifecycle v1 — held / pending_payment state machine
Status: IN PROGRESS (sub-phase B complete)
Depends on: 05-direct-booking-engine, 01-payments-slipok

## Goal
Replace the current public-booking behaviour that creates a `confirmed` row
before payment with a proper state machine:

`held` → `pending_payment` → `pending_verification` → `confirmed`

and release inventory automatically when a hold or payment window expires,
without relying on a cron job.

## Non-goals
- Front-desk `checked_in` / `checked_out` transitions (Phase 2 front-desk feature)
- Refund flow UI (handled later)
- Guest portal / accounts

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
- [ ] A — schema migration (`20260910_booking_lifecycle_v1.sql` written and pushed; NOT YET applied — human must run it + its verify script in the Supabase SQL editor)
- [x] B — core state machine + lazy expiry + `holdRoomType` + `confirmBookingDetails`
- [ ] C — wire public client to use `holdRoomType` / `confirmBookingDetails`
- [ ] D — payment session integration for held bookings
- [ ] E — retire `createPublicBooking` in favour of the hold flow
- [ ] F — staff-facing status management + audit log UI

## Acceptance criteria
- [x] `shared/bookingLifecycle.test.ts` covers transitions, expiry, and inventory rules.
- [x] `getPublicHotelAvailability` no longer counts expired holds as occupied.
- [x] `createPublicBooking`'s own availability check uses the same occupancy rule.
- [x] New tRPC procedures are rate-limited public mutations with full input validation.

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
