# Codex #1 — close 13-03, then 13-04a booking service

Where it runs: Windows, `C:\WORK\channel-manager-c`, branch `agent-c/d1-schema`.
Orchestrator check, 2026-10-28, at a0dcd9a:
- The 21 commits from 13-03 were reviewed.
- One parity bug was found (item 1 below).
- `booking.ts` moves to 13-04. It calls the Postgres RPCs `get_public_room_type_availability_for_guests` and `transition_booking_status`, and porting those RPCs is already 13-04's job.

---- PASTE BELOW THIS LINE ----

The orchestrator reviewed 13-03 (fc1bb2c..a0dcd9a). Good work. Do the tasks below in order, one commit per numbered item.

## 1. Fix: room types sorted as text (13-03)
Money columns are TEXT now. Problem: `server/d1/hotel.ts:197`, `getPublicHotel`, sorts with `orderBy(asc(roomTypes.basePrice))`.
- SQLite compares TEXT values character by character, so "1000.00" sorts before "500.00".
- Postgres sorted these numerically (`server/db/hotel.ts:203` `.order("base_price")`). The public page will now list rooms in the wrong order.

What to do:
- Sort in TypeScript with `moneyToSatang` from `server/db/money.ts`. Break ties by `id` so the order is stable.
- Add a test with base prices "500.00", "1000.00" and "95.50". The expected order is 95.50, 500.00, 1000.00. The test must fail before the fix.
- Search every file in `server/d1/*.ts` for SQL that orders, compares, sums (SUM/MIN/MAX) or filters with `<`/`>` on a money or decimal TEXT column. That covers price, amount, base_price, override_price, unit_price, total_price, refund amounts and child height limits. Fix each one the same way, or list it in the handoff as checked and safe.
- Commit: `fix(d1): order money columns numerically, not as text (13-03)`.

## 2. Close 13-03
Owner decision (2026-10-28): porting `server/db/booking.ts` moves to 13-04 as ticket 13-04a.
Why: `booking.ts` depends on the RPCs `get_public_room_type_availability_for_guests`, `transition_booking_status` and `get_public_hotel`. Porting Postgres functions is 13-04's scope, so 13-03 should not port them twice.
- Move the booking.ts item in `.agent/OPEN_QUESTIONS.md` to Resolved, with this answer.
- In `specs/13-cloudflare-migration.md`:
  - Mark 13-03 DONE. Note that booking.ts moved to 13-04a.
  - Under 13-04, list these sub-tickets:
    - 13-04a: booking/availability/pricing service.
    - 13-04b: iCal sync and export (`sync_ota_ical_blocks`, `get_ota_ical_export`).
    - 13-04c: everything else that is left.
  - Each sub-ticket names the exact Postgres functions it ports, taken from the final definitions.
- Add a handoff entry with the full-suite test counts.
- Commit: `docs(spec-13): close 13-03, move booking port to 13-04a`.

## 3. Ticket 13-04a: booking service on D1
Port the booking-related Postgres functions as TypeScript services, plus a new `server/d1/booking.ts` with the same 9 exports as `server/db/booking.ts`. Do not rewire live callers.

Rules:
- **Money**:
  - Every price, occupancy surcharge, child rate, rate override, add-on total and booking total is computed in bigint satang (`server/db/money.ts`) and stored as decimal TEXT.
  - Never use JS numbers for money.
  - Pricing must match the Postgres function results exactly. Add table-driven tests that mirror the cases in the existing occupancy-pricing tests and in the final SQL definitions: base occupancy, extra adult, child rule/limit, rate override, and multi-night stays.
- **Double booking**:
  - Choosing the room, inserting the booking, inserting the guests/services and writing the status audit happen in one D1 batch.
  - The booking insert is `INSERT ... SELECT ... WHERE NOT EXISTS (overlapping active booking or unexpired hold on that room)`. Check `changes()`, and if it is 0, roll back the batch and fail cleanly.
  - Test: two overlapping bookings for the last room. Exactly one succeeds, and the second gets a clean "no availability" error with no partial rows.
  - Test: back-to-back stays (one checks out on the day the next checks in) both succeed.
- **Holds**:
  - A hold blocks the room until it expires.
  - An expired hold never blocks.
  - `expireBookingIfPast` behaves the same as today.
- **Status transitions**:
  - Use the shared `assertValidTransition`.
  - Each transition updates the status and writes the `booking_status_log` row in the same batch, with a guard against a stale status.
- **Cancellation must free the room**: after cancelling, the same dates can be booked again. Test this. Spec 15 depends on it.
- **Scope**:
  - Every function takes a `D1CallerContext`.
  - Public functions need the server-created `access: public` context and a published hotel.
  - Test cross-hotel denial for every export.
  - Guest PII and booking value need their permissions, the same as the 13-03 scope gates.

Do NOT port these. Another agent owns them in 13-05 on another machine:
- Signup links.
- Staff invites.
- Anything about auth users or sessions.

If a booking function calls one of them, stub it behind an interface and note it in the handoff.

Do not edit `client/`, `worker/`, `vercel.json`, any `.sql` file at the repo root, or `.env`.
A generated drizzle migration is allowed only if the schema truly needs it. Explain why in the commit.

## Definition of done (per ticket)
- `pnpm test`: passed must be above 669, and the only failures allowed are the 7 known credential tests. Paste the real tail.
- Paste the real `pnpm check` and `pnpm build` output.
- Conventional commits ending with the ticket id.
- Handoff entry, plus the spec Status line.
- Do not push, merge or deploy.
- If the spec, the SQL definitions and this prompt disagree, stop and write the question in `.agent/OPEN_QUESTIONS.md`. Do not guess.

End with a short report: commit hashes, test counts, and anything you skipped or stubbed.
