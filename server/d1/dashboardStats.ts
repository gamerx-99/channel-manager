import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { bookings } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";

/**
 * Ids of the rooms that a booking occupies on the night of `date` (the night that starts that day).
 * It uses the same rule as what guests are offered: confirmed and checked-in bookings, plus holds and
 * payments in progress that have not expired. Counts only, no guest data, so it can feed a dashboard
 * card for anyone who may see the hotel's rooms. The caller has already scoped `hotelId`.
 */
export async function occupiedRoomIdsOnNight(db: D1ScopedDatabase, hotelId: string, date: string, nextDate: string, now = new Date()): Promise<Set<string>> {
  const rows = await db.select({ roomId: bookings.roomId }).from(bookings).where(and(
    eq(bookings.hotelId, hotelId),
    isNotNull(bookings.roomId),
    lt(bookings.checkIn, nextDate),
    gt(bookings.checkOut, date),
    or(
      inArray(bookings.status, ["confirmed", "checked_in"]),
      and(inArray(bookings.status, ["held", "pending_payment", "pending_verification"]), or(isNull(bookings.expiresAt), gte(bookings.expiresAt, now))),
    ),
  ));
  return new Set(rows.map(row => row.roomId as string));
}

/** Rooms still free tonight: rooms in service (not in maintenance) minus the ones a booking occupies. */
export function freeRoomsTonight(rooms: ReadonlyArray<{ id: string; status: string }>, occupiedRoomIds: ReadonlySet<string>): number {
  return rooms.filter(room => room.status !== "maintenance" && room.status !== "out_of_service" && !occupiedRoomIds.has(room.id)).length;
}
