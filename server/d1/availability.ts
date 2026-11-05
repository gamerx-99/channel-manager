import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, lt, gt, sql } from "drizzle-orm";
import { availability, bookings, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { moneyToSatang } from "../db/money";
import { AVAILABILITY_BATCH_MAX_DAYS, AVAILABILITY_BATCH_MAX_ROOM_TYPES } from "@shared/availabilityBatch";

function canonicalMoney(value: string): string {
  const satang = moneyToSatang(value);
  if (satang < BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Price cannot be negative." });
  return `${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, "0")}`;
}

export async function listBookingOccupancyForHotel(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  checkIn: string,
  checkOut: string,
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "operations.view_bookings", "availability.occupancy.read", now);
  return db.select({
    roomId: bookings.roomId,
    checkIn: bookings.checkIn,
    checkOut: bookings.checkOut,
    status: bookings.status,
    expiresAt: bookings.expiresAt,
    source: bookings.source,
    guestName: bookings.guestName,
  }).from(bookings).where(and(
    eq(bookings.hotelId, hotelId),
    lt(bookings.checkIn, checkOut),
    gt(bookings.checkOut, checkIn),
  ));
}

export async function listAvailabilityForHotel(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "revenue.manage_rates", "availability.read", now);
  return db.select({
    id: availability.id,
    roomTypeId: availability.roomTypeId,
    date: availability.date,
    price: availability.price,
    roomsAvailable: availability.roomsAvailable,
    roomTypes: { id: roomTypes.id, hotelId: roomTypes.hotelId, name: roomTypes.name },
  }).from(availability).innerJoin(roomTypes, eq(availability.roomTypeId, roomTypes.id))
    .where(eq(roomTypes.hotelId, hotelId)).orderBy(asc(availability.date));
}

export async function updateAvailability(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotelId: string; roomTypeId: string; date: string; price: string; roomsAvailable: number },
  now = new Date(),
) {
  await authorizeRoomType(db, caller, input.hotelId, input.roomTypeId, "availability.update", now);
  const [row] = await db.insert(availability).values({
    roomTypeId: input.roomTypeId, date: input.date, price: canonicalMoney(input.price), roomsAvailable: input.roomsAvailable,
  }).onConflictDoUpdate({
    target: [availability.roomTypeId, availability.date],
    set: { price: canonicalMoney(input.price), roomsAvailable: input.roomsAvailable },
  }).returning();
  return row;
}

// D1 allows 100 bound parameters per statement; a row uses 5, so 18 rows (90) per statement.
const AVAILABILITY_ROWS_PER_STATEMENT = 18;

function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  for (let time = Date.parse(`${startDate}T00:00:00.000Z`); time <= end; time += 86_400_000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}

/**
 * Sets the number of rooms offered (0 = stop sell) for several room types over a date range in one
 * atomic D1 batch, instead of one request per room type and day. Only `rooms_available` is changed:
 * an existing row keeps its price, and a new row starts at the room type's base price.
 * Guest pricing comes from rate overrides, not from this table.
 */
export async function updateAvailabilityBatch(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotelId: string; roomTypeIds: string[]; startDate: string; endDate: string; roomsAvailable: number },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotelId, "revenue.manage_rates", "availability.update_batch", now);
  const roomTypeIds = Array.from(new Set(input.roomTypeIds));
  if (!roomTypeIds.length || roomTypeIds.length > AVAILABILITY_BATCH_MAX_ROOM_TYPES) throw new TRPCError({ code: "BAD_REQUEST", message: `Choose between 1 and ${AVAILABILITY_BATCH_MAX_ROOM_TYPES} room types.` });
  if (!Number.isInteger(input.roomsAvailable) || input.roomsAvailable < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Rooms available must be a whole number, 0 or more." });
  const dates = datesBetween(input.startDate, input.endDate);
  if (!dates.length || dates.length > AVAILABILITY_BATCH_MAX_DAYS) throw new TRPCError({ code: "BAD_REQUEST", message: `Choose a date range of 1 to ${AVAILABILITY_BATCH_MAX_DAYS} days.` });

  const types = await db.select({ id: roomTypes.id, basePrice: roomTypes.basePrice }).from(roomTypes)
    .where(and(eq(roomTypes.hotelId, input.hotelId), inArray(roomTypes.id, roomTypeIds)));
  if (types.length !== roomTypeIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Room type not found." });
  const roomCounts = await db.select({ roomTypeId: rooms.roomTypeId, total: sql<number>`count(*)` }).from(rooms)
    .where(and(eq(rooms.hotelId, input.hotelId), inArray(rooms.roomTypeId, roomTypeIds))).groupBy(rooms.roomTypeId);
  const totalByType = new Map(roomCounts.map(row => [row.roomTypeId, Number(row.total)]));
  for (const type of types) {
    const total = totalByType.get(type.id) ?? 0;
    if (input.roomsAvailable > total) throw new TRPCError({ code: "BAD_REQUEST", message: `Available rooms cannot exceed the ${total} rooms configured for this room type.` });
  }

  const rowsToWrite = types.flatMap(type => dates.map(date => ({ roomTypeId: type.id, date, price: canonicalMoney(String(type.basePrice)) })));
  const statements = [];
  for (let start = 0; start < rowsToWrite.length; start += AVAILABILITY_ROWS_PER_STATEMENT) {
    const chunk = rowsToWrite.slice(start, start + AVAILABILITY_ROWS_PER_STATEMENT);
    const params = chunk.flatMap(row => [crypto.randomUUID(), row.roomTypeId, row.date, row.price, input.roomsAvailable]);
    statements.push(db.$client.prepare(
      `insert into availability (id, room_type_id, date, price, rooms_available) values ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}
       on conflict (room_type_id, date) do update set rooms_available = excluded.rooms_available`,
    ).bind(...params));
  }
  await db.$client.batch(statements);
  return { rows: rowsToWrite.length, roomTypes: types.length, days: dates.length, roomsAvailable: input.roomsAvailable };
}

export async function listRateOverridesForRoomType(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  roomTypeId: string,
  now = new Date(),
) {
  await authorizeRoomType(db, caller, hotelId, roomTypeId, "rate_overrides.read", now);
  return db.select().from(rateOverrides).where(eq(rateOverrides.roomTypeId, roomTypeId)).orderBy(asc(rateOverrides.startDate));
}

export async function assertBookingMinStay(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  now = new Date(),
): Promise<void> {
  const overrides = await listRateOverridesForRoomType(db, caller, hotelId, roomTypeId, now);
  const min = overrides.filter(item => item.minStayNights != null && item.startDate < checkOut && item.endDate >= checkIn)
    .reduce<number | null>((max, item) => max == null ? item.minStayNights : Math.max(max, item.minStayNights!), null);
  if (min == null) return;
  const nights = Math.round((Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / 86_400_000);
  if (nights < min) throw new TRPCError({ code: "BAD_REQUEST", message: `Booking must be at least ${min} night${min === 1 ? "" : "s"}.` });
}

export async function listRateOverrides(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, roomTypeId?: string, now = new Date()) {
  const scope = await authorizeHotelAction(db, caller, hotelId, "revenue.manage_rates", "rate_overrides.list", now);
  const rows = await db.select({
    id: rateOverrides.id, roomTypeId: rateOverrides.roomTypeId, startDate: rateOverrides.startDate,
    endDate: rateOverrides.endDate, overridePrice: rateOverrides.overridePrice,
    minStayNights: rateOverrides.minStayNights, createdAt: rateOverrides.createdAt,
  }).from(rateOverrides).innerJoin(roomTypes, eq(rateOverrides.roomTypeId, roomTypes.id))
    .where(and(eq(roomTypes.hotelId, hotelId), roomTypeId ? eq(rateOverrides.roomTypeId, roomTypeId) : undefined))
    .orderBy(asc(rateOverrides.startDate));
  return rows.map(row => ({ ...row, overridePrice: scope.permissions.includes("property.view_financials") ? row.overridePrice : null }));
}

export async function createRateOverride(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotelId: string; roomTypeId: string; startDate: string; endDate: string; overridePrice: string; minStayNights: number | null },
  now = new Date(),
) {
  await authorizeRoomType(db, caller, input.hotelId, input.roomTypeId, "rate_overrides.create", now);
  const id = crypto.randomUUID();
  const rows = await db.all(sql`insert into rate_overrides (id, room_type_id, start_date, end_date, override_price, min_stay_nights)
    select ${id}, ${input.roomTypeId}, ${input.startDate}, ${input.endDate}, ${canonicalMoney(input.overridePrice)}, ${input.minStayNights}
    where not exists (select 1 from rate_overrides where room_type_id = ${input.roomTypeId}
      and start_date <= ${input.endDate} and end_date >= ${input.startDate})
    returning id, room_type_id as roomTypeId, start_date as startDate, end_date as endDate,
      override_price as overridePrice, min_stay_nights as minStayNights, created_at as createdAt`);
  if (!rows.length) throw new TRPCError({ code: "CONFLICT", message: "This room type already has a rate override overlapping the selected dates." });
  return rows[0];
}

export async function deleteRateOverride(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, rateOverrideId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "revenue.manage_rates", "rate_overrides.delete", now);
  const [row] = await db.delete(rateOverrides).where(and(
    eq(rateOverrides.id, rateOverrideId),
    sql`${rateOverrides.roomTypeId} in (select id from room_types where hotel_id = ${hotelId})`,
  )).returning({ id: rateOverrides.id });
  return row ?? null;
}

async function authorizeRoomType(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, roomTypeId: string, action: string, now: Date) {
  await authorizeHotelAction(db, caller, hotelId, "revenue.manage_rates", action, now);
  const [roomType] = await db.select({ id: roomTypes.id }).from(roomTypes).where(and(
    eq(roomTypes.id, roomTypeId), eq(roomTypes.hotelId, hotelId),
  )).limit(1);
  if (!roomType) throw new TRPCError({ code: "NOT_FOUND", message: "Room type not found." });
}
