import type { D1ScopedDatabase } from "../db/scope";

const occupiedWhere = `(
  b.status IN ('confirmed', 'checked_in') OR
  (b.status IN ('held', 'pending_payment', 'pending_verification')
    AND (b.expires_at IS NULL OR b.expires_at >= ?))
)`;

export type ExpiredHoldNightScope = { hotelId: string } | { roomId: string };

/** Remove stale holds' inventory rows before attempting a new occupancy write. */
export function releaseExpiredHoldNightsStatement(db: D1ScopedDatabase, scope: ExpiredHoldNightScope, now: Date) {
  const filter = "hotelId" in scope ? "b.hotel_id = ?" : "b.room_id = ?";
  const value = "hotelId" in scope ? scope.hotelId : scope.roomId;
  return db.$client.prepare(`DELETE FROM booking_nights
    WHERE booking_id IN (
      SELECT b.id FROM bookings b
      WHERE ${filter}
        AND b.status IN ('held', 'pending_payment', 'pending_verification')
        AND b.expires_at IS NOT NULL AND b.expires_at < ?
    )`).bind(value, now.getTime());
}

/** Create only missing nights for the now-occupying booking; a competing booking raises UNIQUE. */
export function addNightsStatement(db: D1ScopedDatabase, bookingId: string, nights: string[], now: Date) {
  return db.$client.prepare(`INSERT INTO booking_nights (room_id, night, booking_id)
    SELECT b.room_id, j.value, b.id FROM bookings b, json_each(?) j
    WHERE b.id = ? AND b.room_id IS NOT NULL AND ${occupiedWhere}
      AND b.check_in <= j.value AND b.check_out > j.value
      AND NOT EXISTS (
        SELECT 1 FROM booking_nights n
        WHERE n.room_id = b.room_id AND n.night = j.value AND n.booking_id = b.id
      )`).bind(JSON.stringify(nights), bookingId, now.getTime());
}

/** Release a booking's nights if its current status/expiry no longer occupies inventory. */
export function releaseNightsStatement(db: D1ScopedDatabase, bookingId: string, now = new Date()) {
  return db.$client.prepare(`DELETE FROM booking_nights
    WHERE booking_id = ? AND NOT EXISTS (
      SELECT 1 FROM bookings b WHERE b.id = ? AND b.room_id IS NOT NULL AND ${occupiedWhere}
    )`).bind(bookingId, bookingId, now.getTime());
}

export function isBookingNightsUniqueConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: booking_nights\./i.test(error.message);
}
