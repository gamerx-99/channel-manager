# Codex #1: answer to the 13-04b cancellation question, then do 13-04b

Your review fixes a3aa447 and 7d3a3a4 are accepted. Good catch stopping on the SQL conflict.

## Answer: the owner policy wins over the SQL
- Source: the owner's spec 15 draft, which is not in your checkout. It is quoted here:
  > "The iCal sync must NOT revert a manually cancelled booking back to active while the event is still in the OTA feed."
- Implement it as an explicit, tested exception to the behaviour of `20261026_ota_ical_room_type_mode.sql`. Close the OPEN_QUESTIONS entry, citing this answer.

## Exact rule (so the legitimate revive in the SQL still works)
The SQL revives cancelled rows for a good reason: when the OTA drops a UID, the sync itself cancels the booking, and if the UID comes back, the OTA re-added it. That case must keep working. So tell the two kinds of cancellation apart by who cancelled:

1. **Sync-cancelled**:
   - The latest `booking_status_log` row for the booking has `to_status = 'cancelled'`, `changed_by` NULL, and reason `ota_ical_removed_from_feed`.
     - Use that exact reason string. Write it in the sync's own cancel batch.
   - If the UID reappears, revive the booking to `confirmed` exactly like the SQL does, with the same NOT EXISTS / room-candidate logic.
     - Log the revive with reason `ota_ical_restored`.
2. **Staff-cancelled**: any other cancelled row, for example one where `changed_by` is a user, or any other reason.
   - If the UID is still in the feed, skip it.
   - Do not update the row and do not insert a new block for that UID.
   - Add `{ uid, booking_id, start, end }` to `skipped_uids` in the sync result.
   - Do not count it as a conflict.
3. If a cancelled row has NO status-log row at all (legacy data migrated from Supabase), treat it as **staff-cancelled**, and skip it.
   - ASSUMPTION: the safe side is to not resurrect a booking that might be cancelled. Mark it `ASSUMPTION:` in a code comment.

Everything else in the 13-04b scope from the earlier prompt (`.agent/codex-prompt-13-04a-fix-13-04b.md`) is unchanged:
- The sync must be idempotent.
- `checked_in` and `checked_out` bookings are never touched.
- The export feed is valid iCal, and its token is checked per hotel.
- The cron uses `access: "system"`.
- No fetch and no URL guard (those are in 13-06).

## Tests to add (besides the existing ones)
- A booking that staff cancelled while its UID is still in the feed stays cancelled. It appears in `skipped_uids`, no new booking is created, and the room is still free for a direct booking.
- If the UID is dropped, the sync cancels the booking. If the UID then reappears, the booking is revived to `confirmed`, and both log rows exist.
- A cancelled row with no log row is skipped.
- Running the same feed twice gives the same result: no duplicate rows and no extra log rows.

## Done
- Run `pnpm test` (only the 7 known env failures are allowed), `pnpm check` and `pnpm build`, and paste the real output.
- One commit per concern, plus a handoff entry.
- Stop after 13-04b. No push, merge or deploy.
