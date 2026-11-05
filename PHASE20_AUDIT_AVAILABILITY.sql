-- PHASE20_AUDIT_AVAILABILITY.sql
-- STEP 0 (READ-ONLY) — data audit for Part 5 (close nights / stop sell, spec 20).
-- Run this BEFORE merging/deploying Part 5. Makes no changes.
-- Agents in this project may not read production, so a human runs it with:
--   wrangler d1 execute hayhost-production --remote --file=PHASE20_AUDIT_AVAILABILITY.sql
-- (or staging with hayhost-staging). Paste the full output back into the ticket.

-- Query 1: how much is there?
SELECT COUNT(*) AS total_rows,
       SUM(date >= date('now')) AS future_rows,
       SUM(date >= date('now') AND rooms_available = 0) AS future_stopped_rows
FROM availability;

-- Query 2: future rows that would limit sales, with the room count they would limit.
-- Every row returned must be confirmed by the hotel ("yes, that night is closed")
-- or deleted before enforcement ships. Rows in the past are ignored.
SELECT a.room_type_id, a.date, a.rooms_available,
       (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = a.room_type_id) AS total_rooms
FROM availability a
WHERE a.date >= date('now')
  AND a.rooms_available < (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = a.room_type_id)
ORDER BY a.date
LIMIT 200;

-- Query 3 (extra): hotels/room types touched by those rows, to know whom to ask.
SELECT r.hotel_id, a.room_type_id, COUNT(*) AS rows_below_cap
FROM availability a
JOIN rooms r ON r.room_type_id = a.room_type_id
WHERE a.date >= date('now')
  AND a.rooms_available < (SELECT COUNT(*) FROM rooms r2 WHERE r2.room_type_id = a.room_type_id)
GROUP BY r.hotel_id, a.room_type_id
ORDER BY rows_below_cap DESC;

-- Query 4 (extra): rows written with rooms_available = 0 in the past 90 days (suspect dashboard quick edit).
SELECT a.room_type_id, a.date, a.rooms_available, a.price
FROM availability a
WHERE a.date >= date('now')
  AND a.rooms_available = 0
ORDER BY a.date
LIMIT 200;
