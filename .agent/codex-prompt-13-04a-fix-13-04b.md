# Codex #1 — 13-04a review fixes, then 13-04b iCal

Where it runs: Windows, `C:\WORK\channel-manager-c`, branch `agent-c/d1-schema`.
Orchestrator review of 040e449/09fb06c (2026-10-28):
- The double-booking guard is correct: one INSERT…SELECT with NOT EXISTS, and the dependent rows are gated with `where changes() = 1` in the same batch.
- Money is bigint satang throughout.
- Cancelled, expired and checked-out bookings do not block inventory.

---- PASTE BELOW THIS LINE ----

The orchestrator reviewed 13-04a (040e449). The atomic booking insert and the satang pricing look right. Fix the items below, one commit each, then start 13-04b.

## 1. Security: guests can set their own add-on prices (13-04a)
`confirmBookingDetails` in `server/d1/booking.ts` is a PUBLIC procedure. It takes `services[].unit_price`, `service_name` and `pricing_model` from the request and charges them as given. A guest could send `unit_price: "0"` for breakfast, or invent a service.
- The Supabase version has the same flaw, so this is pre-existing. Fix it in D1 anyway; it must not carry over to Cloudflare.
- Fix:
  - The public input accepts only `hotel_service_id` + `quantity`.
  - Load each service from `hotel_services` where `id = ? AND hotel_id = booking.hotel_id AND is_active = 1`.
  - Take name, pricing model and unit price from that row. Reject unknown, inactive or other-hotel IDs with BAD_REQUEST.
- Note the input-shape change in the handoff. The 13-07 client swap will send IDs. Do not edit `server/db/booking.ts` or `client/`.
- Tests, each failing before the fix:
  - A client-sent price is ignored or rejected.
  - Another hotel's service ID is rejected.
  - An inactive service is rejected.
  - The booking total equals room + server-priced services.
- Commit: `fix(d1): price public add-ons from hotel_services, not client input (13-04a)`.

## 2. Small hardening (13-04a)
- `createBookingWithGuests` calls `assertValidTransition(status, status)`, which always passes. Check the status against the `BookingStatus` list instead. Staff creation should also only allow the statuses the Supabase version allowed. Read `server/db/booking.ts` and the final SQL definitions; if they disagree, stop and ask in OPEN_QUESTIONS.
- `assertTransition` in `bookingService.ts` wraps a try/catch that only rethrows. Remove the wrapper.
- Add a test that creating a booking with an invalid status is rejected.
- Commit: `fix(d1): validate staff booking status on create (13-04a)`.

## 3. Ticket 13-04b: iCal sync and export on D1
Port the Postgres functions listed under 13-04b in spec 13 (`sync_ota_ical_blocks`, `get_ota_ical_export` and any helpers they call) as TypeScript services in `server/d1/`, the same way 13-04a was done.

Rules:
- **Owner decision (spec 15): a booking that staff cancelled by hand must never be revived by an iCal sync.** If the OTA feed still contains that UID, leave the booking cancelled. Do not create a new block for the same UID and dates. Write the skipped UID to the sync log/result so staff can see it. Test this.
- Sync is idempotent: running the same feed twice changes nothing the second time.
- Blocks removed from the feed are released the same way the Postgres function does it. Mirror its exact semantics.
- New blocks use the same atomic NOT EXISTS guard as 13-04a. Decide what happens when an OTA block overlaps a direct booking by following the Postgres function: does it conflict or skip? Test it.
- Export:
  - Output is valid iCal (CRLF line endings, folded lines, escaped text).
  - It contains only the occupying bookings of that room or room type. Mirror the Postgres scope.
  - It contains no guest PII beyond what the Postgres export already includes.
  - Export tokens are checked server-side. A token for hotel A never returns hotel B's data.
- Every function takes a `D1CallerContext`. The sync is called later by a Cron Trigger (13-06), so add an explicit `access: "system"` (or similar) context created only by server code, and test that public and hotel callers cannot use it.
- Do not do the network fetch or the URL guard; those are 13-06. Take the parsed feed or raw ICS text as input.
- Do not edit `client/`, `worker/`, `vercel.json`, any `.sql` file at the repo root, or `.env`. Do not touch auth, invites or signup links (13-05 is on another machine).

## Definition of done (per ticket)
- `pnpm test`: passed must be above 681, and the only failures allowed are the 7 known credential tests. Paste the real tail.
- Paste the real `pnpm check` and `pnpm build` output.
- Conventional commits ending with the ticket id. Handoff entry, plus the spec Status line.
- Do not push, merge or deploy.
- If the spec, the SQL definitions and this prompt disagree, stop and write the question in `.agent/OPEN_QUESTIONS.md`.

End with a short report: commit hashes, test counts, and anything you skipped.
