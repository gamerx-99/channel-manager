import { and, asc, eq, gte, lt } from "drizzle-orm";
import { availability, roomTypes } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";

/**
 * Phase 1 of specs/20: a night is "closed" when the room type has an `availability` row
 * for that date with rooms_available = 0. A missing row means open. Rows before today
 * (Thai time, UTC+7) are ignored. No caps above 0 yet.
 */
export const CLOSED_NIGHT_ERROR_PREFIX = "STOP_SELL";

export function thaiToday(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** SQL fragment for the guest insert (alias `r` = rooms): true when no closed night hits the stay. Params: from, to-exclusive, today. */
export const NO_CLOSED_NIGHT_SQL = `not exists (select 1 from availability a where a.room_type_id = r.room_type_id
                and a.rooms_available = 0 and a.date >= ? and a.date < ? and a.date >= ?)`;

export function noClosedNightParams(checkIn: string, checkOut: string, now: Date) {
  return [checkIn, checkOut, thaiToday(now)];
}

/** True when any positive per-night online cap is already consumed by active room-nights. */
export const NO_ALLOTMENT_EXCEEDED_SQL = `not exists (select 1 from availability a where a.room_type_id = r.room_type_id
                and a.date >= ? and a.date < ? and a.date >= ? and a.rooms_available > 0
                and (select count(*) from booking_nights n
                  join rooms booked_room on booked_room.id = n.room_id
                  join bookings booked on booked.id = n.booking_id
                  where booked_room.room_type_id = r.room_type_id and n.night = a.date
                    and (booked.status in ('confirmed', 'checked_in')
                      or (booked.status in ('held', 'pending_payment', 'pending_verification')
                        and (booked.expires_at is null or booked.expires_at >= ?)))) >= a.rooms_available)`;

export function noAllotmentExceededParams(checkIn: string, checkOut: string, now: Date) {
  return [checkIn, checkOut, thaiToday(now), now.getTime()];
}

function firstNight(checkIn: string, now: Date) {
  const today = thaiToday(now);
  return checkIn > today ? checkIn : today;
}

/** Closed nights inside [checkIn, checkOut), per room type id, for the whole hotel. */
export async function closedNightsByRoomType(db: D1ScopedDatabase, hotelId: string, checkIn: string, checkOut: string, now: Date): Promise<Map<string, string[]>> {
  const rows = await db.select({ roomTypeId: availability.roomTypeId, date: availability.date }).from(availability)
    .innerJoin(roomTypes, eq(roomTypes.id, availability.roomTypeId))
    .where(and(eq(roomTypes.hotelId, hotelId), eq(availability.roomsAvailable, 0), gte(availability.date, firstNight(checkIn, now)), lt(availability.date, checkOut)))
    .orderBy(asc(availability.date));
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.roomTypeId, [...(map.get(row.roomTypeId) ?? []), row.date]);
  return map;
}

/** Closed nights of one room type inside the stay (empty when open). */
export async function closedNightsForRoomType(db: D1ScopedDatabase, roomTypeId: string, checkIn: string, checkOut: string, now: Date): Promise<string[]> {
  const rows = await db.select({ date: availability.date }).from(availability)
    .where(and(eq(availability.roomTypeId, roomTypeId), eq(availability.roomsAvailable, 0), gte(availability.date, firstNight(checkIn, now)), lt(availability.date, checkOut)))
    .orderBy(asc(availability.date));
  return rows.map(row => row.date);
}
