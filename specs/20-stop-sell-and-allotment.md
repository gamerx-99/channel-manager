# 20 — Stop sell and allotment that guests respect

Status: draft, not approved (2026-11-05). Needs the owner's decisions listed at the end before step 3 of the rollout.

## Problem (verified in the code on 2026-11-05)

Two tables describe what a guest may buy, and they are not connected:

| Table | Written by | Read by the guest booking flow? |
|---|---|---|
| `availability` (room type, date, `price`, `rooms_available`) | Calendar page and dashboard calendar "stop sale" / "rooms available" | **No.** Only the staff calendar, the dashboard router and hotel closure read it. |
| `rate_overrides` (room type, date range, `override_price`, `min_stay_nights`) | `/dashboard/pricing` | **Yes.** `server/d1/bookingService.ts` (`resolveRateSatang`, `priceStayForRoomType`) and `server/d1/booking.ts` use it for price and minimum stay. |

Guest availability is `rooms of the type` minus `rooms with an overlapping active booking` (`roomAvailabilityCounts` in `server/d1/bookingService.ts`), and the insert is guarded by an overlap check in `atomicInsert` (`server/d1/booking.ts`). Neither looks at `availability`.

So pressing "stop sale" or lowering "rooms available" has no effect on guests. As a stop-gap the owner-facing controls are hidden (`CALENDAR_EDITING_ENABLED`, `DASHBOARD_CALENDAR_EDITING_ENABLED`, both `false`).

## Proposed behaviour (ASSUMPTION: needs the owner's yes)

Keep `availability` as the source for how many rooms of a type may be sold on a night, and keep `rate_overrides` as the source for price and minimum stay. No schema change and no migration.

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

## Rollout

1. Merge the batch write (`updateAvailabilityBatch`, already on branch `work/overnight-2026-11-05`): one atomic D1 batch for many room types and days; limits 20 room types, 62 days, 18 rows per statement (D1 allows 100 bound parameters).
2. Run the audit above and settle the result with the hotels.
3. Ship enforcement points 1 and 2 with tests (listing, race on the last room, stop-sell night inside a stay, cap of N, reopening). Deploy only with the owner's approval; rollback is `wrangler rollback`.
4. Re-enable the staff controls for stop sell and allotment only (flags above), wired to the batch procedure, plus the side-panel bulk editor. Price edits stay on `/dashboard/pricing`.
5. Hide nothing again without telling the owner; remove the two flags when done.

## Tests to write with step 3

- A stay containing one stopped night is not offered and cannot be inserted (also when two requests race).
- A cap of 1 on a night with 2 rooms: one booking succeeds, the second is rejected for that night.
- A stopped night outside the stay does not matter; check-out day is not a night of the stay.
- Past rows are ignored; a missing row means the full room count.
- Public hold, confirmation and expiry still release the right nights.

## Decisions for the owner

1. **Where is stop sell stored?** Recommended: the existing `availability` table (no migration, the controls already write it). Alternative: a closed flag on `rate_overrides` (needs a migration the human applies, and overlap rules get harder).
2. **Partial caps?** Only open/closed per night, or also "sell at most N rooms of this type" (the table already supports N)? Recommended: both.
3. **Do staff bookings respect stop sell?** Recommended: warn and allow (staff can override), guests cannot.
4. **Hotels with old rows**: confirm the list from the audit with each hotel, or delete all rows older than the launch.
