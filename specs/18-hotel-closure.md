# Spec 18 — Closing a hotel and deleting its data

Status: IN REVIEW (built on `claude/priceless-galileo-e5dfc3`; migration not applied; needs a lawyer before launch)

Terms 7.3 and DPA 7.1 promise an export for 30 days after the service ends, then deletion within
60 days. Nothing did this, so the owner asked for the code to match the text (2026-11-01). The
7-day wait is the owner's rule from 2026-10-31.

## Timeline

Everything is worked out from `hotels.closure_requested_at` (`shared/hotelClosure.ts`):

| Day | What happens |
|---|---|
| 0 | Owner requests with hotel name, password and a code if 2FA is on. Site, bookings and iCal stop. Staff and support lose the hotel, support grants are revoked, unused signup links expire. |
| 0-7 | Owner can cancel. The previous published state comes back. Signing in never cancels: the owner is sent to `/hotel-closure` and must press Cancel or Continue. Continue keeps the deadline. |
| 7 | The service ends. Cancelling stops working. A sole owner can now delete their account. |
| 7-37 | Owner can download the data. |
| 66 | The Worker cron deletes the hotel (day 59 after the service ends, a day inside the promise so a failed run can retry). |

## Server

- `resolveScope` refuses every action on a hotel in closure, except `hotel.closure.cancel` and `hotel.closure.export`.
- A guest needs a published hotel, and closing unpublishes it, so the guest path adds no check.
- `property.close_hotel` is owner-reserved, so it cannot be delegated and support never holds it. `super_admin` does not hold it.
- `exportHotelData` lists columns by name. Credentials, tokens, IP hashes and staff ids stay out.
- `purgeClosedHotels` deletes R2 objects first, then the `hotels` row in one batch with a `hotel_purge_log` row. All hotel tables cascade. It handles 5 hotels per run.

## Limits

- Bookings already made are not cancelled. The warning tells the owner to contact those guests.
- D1 Time Travel keeps deleted rows until its own window ends; the DPA's "backups on their normal cycle" covers this.
- Deletion is outright. Whether anything must be kept, and by whom, needs a lawyer (see `.agent/OPEN_QUESTIONS.md`).
- Deactivate (a pause with no deletion) is a separate feature and is not built.

## Tests

- Unit: `server/d1/hotelClosure.test.ts`, on real SQLite with the migrations and foreign keys on.
- Router: `server/hotelClosure.access.test.ts`.
- Contract: `client/src/pages/HotelClosure.contract.test.ts`.
