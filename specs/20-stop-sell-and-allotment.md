# 20 — Stop sell and allotment that guests respect

Status (2026-11-10): guest stop-sell and allotment enforcement, staff override notice, and the owner calendar controls are implemented and covered by tests. The integration branch adds saved-allotment restoration when reopening Stop Sell. Its D1 migration is prepared but not applied. Before release, the owner must review legacy future availability rows with each hotel; no production data was queried or changed during this work.

## Problem (verified in the code on 2026-11-05)

Two tables describe what a guest may buy. The current guest flow reads both:

| Table | Written by | Read by the guest booking flow? |
|---|---|---|
| `availability` (room type, date, `price`, `rooms_available`, optional `reopen_rooms_available`) | Owner calendar and dashboard Stop Sell controls | **Yes.** Guest listing and booking writes enforce the per-night cap. |
| `rate_overrides` (room type, date range, `override_price`, `min_stay_nights`) | `/dashboard/pricing` | **Yes.** `server/d1/bookingService.ts` (`resolveRateSatang`, `priceStayForRoomType`) and `server/d1/booking.ts` use it for price and minimum stay. |

Guest availability applies the per-night `availability.rooms_available` cap and subtracts rooms already booked. Booking insertion repeats the cap check atomically so two guests cannot claim the last allowed room.

Stop Sell closes online bookings only; existing bookings remain unchanged. Staff can confirm an override under the existing booking permission.

## Behaviour

Keep `availability` as the source for how many rooms of a type may be sold on a night, and keep `rate_overrides` as the source for price and minimum stay. A nullable `reopen_rooms_available` field remembers the last positive cap while a night is stopped, so reopening restores the hotel's prior online allotment. Existing rows start with this field null and remain readable.

For room type `T` and night `n`:

- `cap(T, n)` = `availability.rooms_available` if a row exists for `(T, n)`, otherwise the number of rooms of `T`.
- Stop sell on `(T, n)` is `cap = 0`.
- A stay `[check_in, check_out)` can be sold for `T` only if for **every** night `n` in it: `rooms of T booked on n` is less than `min(total rooms of T, cap(T, n))`.
- Existing bookings are never cancelled or changed by a later stop sell; it only stops new ones.
- The `price` column of `availability` is not used for guests. The Calendar must not offer a day-price field; prices are managed as rate overrides.

## Enforcement points

1. **What guests are offered**: `roomAvailabilityCounts` / `getPublicRoomTypeAvailabilityForGuests` subtract the cap for every night of the requested stay.
2. **The write**: the cap check goes inside the same SQL statement as the booking insert in `atomicInsert`, next to the existing overlap `not exists`, so two guests cannot both take the last allowed room. A check only in the listing is not enough.
3. **Staff bookings** (`source = manual`): see decision 3.
4. **OTA iCal export** (hidden feature): closed nights should be exported as busy. Not in the first step.

## Before it is switched on: data audit (read-only)

Old rows in `availability` would start to hide rooms from guests. Someone with production access runs these two read-only queries first (agents in this project are not allowed to read production, so the owner or a human runs them):

```sql
-- how much is there?
SELECT COUNT(*) AS total_rows,
       SUM(date >= date('now')) AS future_rows,
       SUM(date >= date('now') AND rooms_available = 0) AS future_stopped_rows
FROM availability;

-- future rows that would limit sales, with the room count they would limit
SELECT a.room_type_id, a.date, a.rooms_available,
       (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = a.room_type_id) AS total_rooms
FROM availability a
WHERE a.date >= date('now')
  AND a.rooms_available < (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = a.room_type_id)
ORDER BY a.date
LIMIT 200;
```

Every row the second query returns must be confirmed by the hotel ("yes, that night is closed") or deleted before enforcement ships. Rows in the past are ignored.

## Rollout status

1. The batch write and per-night guest enforcement are integrated; regression tests cover closed nights, capacity, booking lifecycle and reopen behavior.
2. Owner UI controls are enabled. Rate, allotment and Stop Sell permissions are checked independently in the UI and D1 service.
3. Apply `drizzle/d1/20261109010000_restore_stop_sell_allotment.sql` to the intended environment before deploying this branch. It adds only the nullable restore field; it does not update existing rows.
4. Before enforcing legacy future rows for any production hotel, run the read-only audit above and have each hotel confirm rows that limit sales. No production audit or migration was run as part of this integration.

## Tests to write with step 3

- A stay containing one stopped night is not offered and cannot be inserted (also when two requests race).
- A cap of 1 on a night with 2 rooms: one booking succeeds, the second is rejected for that night.
- A stopped night outside the stay does not matter; check-out day is not a night of the stay.
- Past rows are ignored; a missing row means the full room count.
- Public hold, confirmation and expiry still release the right nights.

## Scope in phases (owner principle, 2026-11-05)

hayhost is a website and direct-booking service with a simple back office, not a channel manager (`DECISIONS.md`). The implemented scope covers closing nights and per-night online caps; additional channel-management behavior remains out of scope unless a real hotel asks.

- **Implemented: close nights and per-night caps.** A night with `rooms_available = 0` cannot be booked by a guest, and a positive value limits total rooms sold on that night, including existing bookings. Both the guest availability calculation and the atomic public booking write enforce the cap. Staff bookings are not restricted; the screen shows a notice and a confirm step. No per-hotel setting, no walk-in-only rule, no reason field.
- **Dropped for now:** a per-hotel choice of how staff may book a closed night (options A, B, C discussed on 2026-11-05). The hotel already controls who may enter bookings through staff permissions.

Everything above about data audit, race safety and `booking_nights` applies to both stop sell and positive caps.
## Consistency check of the owner's choices (2026-11-05)

Checked against the code. Findings that change how the work is written:

1. **"Open for sale: 2 of 5 rooms" means a cap that includes rooms already booked.** This is what the Calendar, the dashboard and the batch write already assume (`min(total rooms, allotment) - booked`, `calendarAvailability.ts`, `dashboardRouter.ts`). With 5 rooms and 1 booked, a cap of 2 leaves 1 more room. The panel must say so ("sell at most N rooms, including those already booked") and show the rooms still left, otherwise "2 rooms" reads as "2 more". A cap below the rooms already booked leaves 0 and cancels nothing.
2. **The dashboard quick edit wrote the wrong number.** `DashboardCalendarView.saveAvailability` sent `roomType.available`, which the server computes as allotment minus bookings, as the new `rooms_available`. Saving on a night that already had a booking therefore wrote a cap that was too low (for example 1 of 2 rooms with 1 booked wrote 1, which leaves 0 once enforced). Any row written that way is suspect. The edit is hidden today; when it returns it must send the cap, not the remainder. This also makes the data audit (decision 4) necessary, not optional.
3. **hayhost does not decide what the hotel's staff may do.** Stop sell and the cap close the *online* channel (what guests can book). A booking entered by the hotel's own staff (`manual`, `walk-in`, `phone`) is the hotel's business: hayhost does not add rules such as "walk-in only", "today only" or a required reason. The system only tells the person entering it: a booking write that hits a closed night returns a typed `STOP_SELL` rejection naming the nights, the screen shows a plain notice ("this night is closed to online guests") and a confirm button, and a second call with `override_stop_sell: true` goes through. Who may enter bookings stays what the hotel already controls with its staff permissions (`operations.manage_bookings`); a hotel that wants no staff exceptions simply does not give that permission. The confirmation is written to the existing booking status log (who, when) as information for the hotel, not as hayhost's policy. Guests are always refused. OTA iCal blocks (`source = ota_ical`) mirror another channel's real booking and are never refused; they count as booked.
4. **The check can use `booking_nights`.** Active bookings already own one row per room and night (`uq_booking_nights_room_night`), expired holds are released at the start of the same batch (`releaseExpiredHoldNightsStatement`), and a new booking adds its nights after the insert. So inside the insert's `WHERE`, the number booked that night for a room type is `count(booking_nights joined to rooms of that type)` without re-implementing the status and hold-expiry rules. D1 serialises writes, so the new clause is race-safe the same way the overlap clause is.
5. **Total rooms differs by screen.** Guests exclude rooms in maintenance; the Calendar and dashboard count every room. For the cap use the guest rule (`min(non-maintenance rooms, cap)`); the staff screens keep their counts. A hotel with a room under maintenance can therefore see 5 on the Calendar and offer 4 to guests; the batch write validates against all rooms. Not a blocker, but the panel should show the same total guests get.
6. **A stay is blocked by any one closed night.** The listing must use the smallest remaining count over the nights, not the count of the first night (today it is the number of rooms free for the whole stay).
7. **Price in `availability` stays unused.** The batch write never changes it; the staff Calendar and dashboard must not offer a day-price field. Guest prices and minimum stay remain on `rate_overrides`.
8. **Audit scope is small.** Rows whose `rooms_available` is at least the room count change nothing, so only rows below it need review; the second audit query already selects those. With a handful of hotels the audit can be done once before deploy, instead of a per-hotel switch (which would need a new column and a migration).

## Decisions (owner, 2026-11-05)

1. **Storage**: the existing `availability` table remains the source of inventory caps; `reopen_rooms_available` is an additive field required to restore a saved cap after Stop Sell. Price stays on `rate_overrides`.
2. **Cap**: set how many rooms may be sold on a night (for example 5 rooms, 2 offered). Stop sell is a cap of 0. Meaning as in finding 1.
3. **Staff bookings**: hayhost does not restrict them (finding 3). Stop sell closes the online channel; staff see a notice and confirm. The hotel controls who may enter bookings through its own staff permissions.
4. **Old rows**: check them with each hotel before enforcement is switched on (finding 8).

## Remaining release gates

1. Apply the prepared migration to the chosen environment and confirm schema parity; do not deploy the new Worker before the column exists.
2. Run the read-only legacy-row audit above and review limiting future rows with each affected hotel before production release.
3. Complete a real guest-to-staff verification journey against a working non-production backend; current checks are automated tests and mocked UI renders, not a live end-to-end booking.
