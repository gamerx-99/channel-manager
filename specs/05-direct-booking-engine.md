# 05 Direct Booking Engine — guest-facing checkout
Status: IN PROGRESS (occupancy/pricing extension; waiting on migration apply + verify)
Depends on: 01-payments-slipok, 02-advanced-pricing

## Public room-type RLS follow-up
- Anonymous room-type reads are allowed only when the related hotel has
  `public_enabled = true`; hotel rows remain private. The published-hotel
  boolean predicate avoids relying on anonymous SELECT access to `hotels`.
- Inventory counts are returned by `get_public_room_type_availability`, which
  exposes only room-type IDs and available counts for that published hotel;
  anonymous clients do not read `rooms` or `bookings`.
- `20261009_public_room_type_rls.sql` and its verify script are prepared but
  pending human application and confirmation in the production SQL editor.
- The same apply/verify requirement applies to
  `20261009_public_booking_inventory.sql` and its verify script.

## Goal
Let a guest complete a real booking from the public hotel page (`PublicHotel.tsx`),
which currently says "Online checkout is not enabled in this MVP" at its booking
section.

## Non-goals
- Guest accounts/login — bookings remain staff-visible only, guests don't get a
  portal in this phase
- Multi-hotel cart/checkout — one hotel per checkout flow, matching the rest of this
  platform's per-hotel scoping

## Why it depends on 01 and 02
Checkout needs *something* to happen at the payment step (Phase A's slip-based
verification, even if "pay by bank transfer, verify later" ends up being the actual
v1 flow rather than instant confirmation) and needs a resolved rate for the selected
dates (Phase B's `resolveEffectiveRate`, rather than always quoting `base_price`).
Confirm with the human whether "pay later, hold the booking as unconfirmed until a
slip is verified" is an acceptable v1 flow before assuming instant payment.

## Interface contract
- Extend `getPublicHotel`'s RPC-backed read (`server/db.ts`) to include live
  availability for a date range — respect the same RLS/public-RPC boundary already
  used for `get_public_hotel`; do not weaken it to add this.
- A new `publicProcedure` for guest checkout, following the exact pattern
  `completeHotelOwnerSignup` established this session: narrow, fully-validated
  input, no auth required, but every side effect double-checked server-side (don't
  trust anything the client claims about price/availability — recompute both
  server-side from the submitted dates).
- Reuses `createBookingWithGuests` (`server/db.ts`) for the actual insert — needs a
  public-safe entry point in front of it, not a new booking-creation code path.

## Data model
No new tables expected beyond what 01/02 already add — this phase is UI + a public
procedure wiring existing pieces together.

## Business rules
- Server must recompute price from `resolveEffectiveRate` (Phase B) and validate
  availability itself — never trust a client-submitted price or a stale availability
  snapshot.
- Decide (with the human) whether a guest checkout creates a `confirmed` booking
  immediately or an `unconfirmed`/`pending-payment` one awaiting slip verification —
  this is a real product decision, log it in `DECISIONS.md` once made, don't assume.

## Error handling
- Double-booking race (two guests submit for the same room/dates near-simultaneously)
  → the existing `prevent_double_booking` exclusion constraint
  (`supabase_migration_production.sql`) already guards this at the DB layer; the
  public procedure must translate that Postgres error into a clear "someone just
  booked this" message, not a raw 500.

## Acceptance criteria
- [x] A guest can select dates, see live availability and the correct resolved rate,
      and submit a booking from `PublicHotel.tsx`
- [x] The server recomputes price/availability itself rather than trusting client
      input
- [x] A double-booking race is handled gracefully, not as a raw server error
- [x] The "Booking Engines" sidebar placeholder links to configuring/previewing this
      flow per hotel

## Test plan
- `server/publicBooking.test.ts`: price/availability recomputation, double-booking
  race handling (simulate the constraint violation and assert the friendly error)
- Client contract test for the checkout form's presence and validation in `client/src/pages/PublicHotel.contract.test.ts`

## Definition of Done
- [x] `pnpm test`, `pnpm check`, `pnpm build` all pass
- [x] No TODO/FIXME left in touched files
- [x] Spec status updated to DONE, `.agent/handoff.md` entry written
- [x] Reviewer approved with evidence

## Occupancy and pricing extension (2026-10-10; supersedes the 2026-10-09 tier model)
- The owner sets a price adjustment for each relevant total occupancy level against
  that night's normal rate at base occupancy. Percent and fixed-THB adjustments are
  supported; fixed THB is a positive/negative difference applied to daily rate
  overrides too. Enabled levels below base must reduce price, enabled levels above
  base must increase it. Disabled levels cannot be booked. Net nightly prices floor
  at zero.
- The base occupancy level is enabled at the normal rate. Other levels default off;
  owners must enable and price them before those guest counts can book.
- Age mode gives infants a fixed 0–2 band and supports up to three owner-defined
  groups beginning at age 3, contiguous without gaps, and ending no later than 17.
  Ages after the final group count as adults. Height mode keeps a single shared
  property threshold and a single child rate for children below it.
- Age groups and child rates are stored per room type. The property-wide age/height
  measurement choice is shared; switching it resets the height thresholds.
- Availability filters by room inventory, occupancy capacity, enabled price level,
  and guest classification. Prices are recomputed by night, including rate
  overrides, and recalculated when a room is held.
- `20261009_room_type_occupancy_pricing.sql` and its verify script remain unapplied
  and must be run by the human in the production SQL editor. The migration backfills
  a complete price-level map with only base occupancy enabled.
