# 02 Advanced Pricing — seasonal/date-range rate rules
Status: DONE — 2026-08-30 (deepseek-v4-pro, 4 tickets T02-01→04); UI-wiring gap
fixed 2026-08-31 (Claude). `AdvancedPricing.tsx` was originally pure `useState`
local mock data (never called the real `createRateOverride`/`listRateOverrides`/
`deleteRateOverride` procedures despite the checked acceptance criteria below) —
now wired to the real backend. See `.agent/DECISIONS.md`'s 2026-08-31 entry.
Depends on: —
Owner-tier: worker-code

## Goal
Let a `revenue_manager`/`hotel_owner` define date-range rate overrides and minimum-
stay rules per room type, and have booking/availability logic resolve the effective
rate for a given date automatically instead of always using `room_types.base_price`.

## Non-goals
- Dynamic/algorithmic pricing based on live occupancy or demand signals — this phase
  is rule-based overrides only
- Channel-specific pricing (different rates per OTA) — out of scope until Phase G
  (live OTA integrations) exists to even carry that data outward

## Interface contract
- `server/routers.ts`: `createRateOverride` / `listRateOverrides` /
  `deleteRateOverride`, `requireHotelPermission(..., 'revenue.manage_pricing_rules')`
  — this permission already exists and is already granted to `hotel_owner` and
  `revenue_manager` (`shared/authorization.ts`), so no permission-model change is
  needed for this phase.
- A pure resolver function, e.g. `resolveEffectiveRate(roomType, date, overrides)` in
  a new `server/pricing.ts`, following the same "pure function, unit-testable in
  isolation" pattern as `server/financials.ts`/`server/channelPerformance.ts`.

## Data model
New table, e.g. `rate_overrides`: `id`, `room_type_id` (FK), `start_date`,
`end_date`, `override_price`, `min_stay_nights` (nullable), `created_at`. Overlapping
ranges for the same room type should be rejected or resolved by a defined precedence
rule — decide which when writing the ticket (reject is simpler and safer; prefer it
unless the human asks for precedence-based override).

## Business rules
- `resolveEffectiveRate` must have a clear, tested precedence: most specific
  (narrowest matching date range) wins, or last-created wins — pick one, document it
  in this file once decided, don't leave it implicit in code.
- `min_stay_nights` should be enforced wherever a booking is created
  (`createBookingWithGuests` in `server/db.ts`) — check whether that enforcement
  belongs in the router (pre-check, clearer error) or the DB layer.

## Error handling
- Overlapping override ranges for the same room type on create → `CONFLICT`, mirror
  `rethrowDomainError`'s existing `23505`/`CONFLICT` handling style.
- A booking that violates `min_stay_nights` → `BAD_REQUEST` with a message naming
  the minimum, not a generic validation error.

## Acceptance criteria
- [x] A revenue_manager/hotel_owner can create, list, and delete date-range rate
      overrides for a room type they manage — server-side was real from
      2026-08-30; the client page only actually calls these procedures as of the
      2026-08-31 UI-wiring fix (it was pure local `useState` before that)
- [x] `resolveEffectiveRate` is unit-tested against: no override (falls back to
      base_price), one matching override, overlapping-range rejection at creation
      time, a date outside any override range
- [x] Booking creation respects `min_stay_nights` when set
- [x] The "Advanced Pricing" sidebar placeholder (`App.tsx`, gated on
      `can("revenue.manage_rates")`) is replaced with a real calendar-style editor

## Test plan
- `server/pricing.test.ts`: pure unit tests for `resolveEffectiveRate` and overlap
  rejection logic
- `server/rateOverrides.access.test.ts`: mocked-router permission boundary test,
  following `financials.access.test.ts`'s style
- Client contract test for the new page, following the established pattern

## Definition of Done
- [x] `pnpm test`, `pnpm check`, `pnpm build` all pass (316 tests, re-verified 2026-08-31)
- [x] No TODO/FIXME left in touched files
- [ ] Migration + `verify_*.sql` pair applied and confirmed by the human — no
      confirmation of this is on record in this session; do not treat as applied
      until the human confirms (corrected 2026-08-31; this box should not have
      been implicitly treated as satisfied when the header was marked DONE)
- [x] Spec status updated to DONE, `.agent/handoff.md` entry written
- [x] Reviewer approved with evidence — this session's Claude review (2026-08-31)
