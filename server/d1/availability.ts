import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, lt, gt, sql } from "drizzle-orm";
import { availability, bookings, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { moneyToSatang } from "../db/money";
import { AVAILABILITY_BATCH_MAX_DAYS, AVAILABILITY_BATCH_MAX_ROOM_TYPES } from "@shared/availabilityBatch";
import { splitRateRanges } from "../../shared/rateRangeSplit";
import { resolveRateSatang } from "./bookingService";
import { isBookingOccupyingInventory } from "../../shared/bookingLifecycle";
import type { Permission } from "../../shared/authorization";

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
  const scope = await authorizeAvailabilityRead(db, caller, hotelId, "availability.read", now);
  const rows = await db.select({
    id: availability.id,
    roomTypeId: availability.roomTypeId,
    date: availability.date,
    price: availability.price,
    roomsAvailable: availability.roomsAvailable,
    reopenRoomsAvailable: availability.reopenRoomsAvailable,
    roomTypes: { id: roomTypes.id, hotelId: roomTypes.hotelId, name: roomTypes.name },
  }).from(availability).innerJoin(roomTypes, eq(availability.roomTypeId, roomTypes.id))
    .where(eq(roomTypes.hotelId, hotelId)).orderBy(asc(availability.date));
  return rows.map(row => ({ ...row, price: scope.permissions.includes("revenue.manage_rates") ? row.price : null }));
}

export async function updateAvailability(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotelId: string; roomTypeId: string; date: string; price: string; roomsAvailable: number; action?: "rate" | "allotment" | "stop_sell"; defaultRoomsAvailable?: number },
  now = new Date(),
) {
  const action = input.action ?? "rate";
  const permission = action === "stop_sell" ? "revenue.manage_stop_sell" : action === "allotment" ? "revenue.manage_allotment" : "revenue.manage_rates";
  if (action === "allotment" && input.roomsAvailable === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Use the stop-sell action to close online sales." });
  const roomType = await authorizeRoomType(db, caller, input.hotelId, input.roomTypeId, permission, "availability.update", now);
  const [stored] = await db.select({ price: availability.price, roomsAvailable: availability.roomsAvailable, reopenRoomsAvailable: availability.reopenRoomsAvailable }).from(availability).where(and(
    eq(availability.roomTypeId, input.roomTypeId), eq(availability.date, input.date),
  )).limit(1);
  const totalRooms = Number((await db.select({ total: sql<number>`count(*)` }).from(rooms).where(and(
    eq(rooms.hotelId, input.hotelId), eq(rooms.roomTypeId, input.roomTypeId),
  )))[0]?.total ?? 0);
  const defaultRooms = input.defaultRoomsAvailable ?? totalRooms;
  if (action !== "rate" && input.roomsAvailable > totalRooms) throw new TRPCError({ code: "BAD_REQUEST", message: `Available rooms cannot exceed the ${totalRooms} rooms configured for this room type.` });
  const initialRooms = action === "rate" ? totalRooms : input.roomsAvailable;
  const initialReopenRooms = action === "stop_sell" && input.roomsAvailable === 0 ? defaultRooms : null;
  const nextPrice = action === "rate" ? canonicalMoney(input.price) : stored?.price ?? canonicalMoney(String(roomType.basePrice));
  const [row] = await db.insert(availability).values({
    roomTypeId: input.roomTypeId, date: input.date, price: nextPrice, roomsAvailable: initialRooms,
    reopenRoomsAvailable: initialReopenRooms,
  }).onConflictDoUpdate({
    target: [availability.roomTypeId, availability.date],
    set: {
      price: nextPrice,
      roomsAvailable: action === "rate" ? availability.roomsAvailable : action === "stop_sell"
        ? input.roomsAvailable === 0 ? 0 : sql`case when ${availability.roomsAvailable} = 0 then coalesce(${availability.reopenRoomsAvailable}, ${input.roomsAvailable}) else ${availability.roomsAvailable} end`
        : input.roomsAvailable,
      reopenRoomsAvailable: action === "stop_sell"
        ? input.roomsAvailable === 0
          ? sql`case when ${availability.roomsAvailable} > 0 then ${availability.roomsAvailable} else ${availability.reopenRoomsAvailable} end`
          : null
        : action === "allotment" ? null : availability.reopenRoomsAvailable,
    },
  }).returning();
  return row;
}

// D1 allows 100 bound parameters per statement; inventory writes use 6 per row.
const AVAILABILITY_ROWS_PER_STATEMENT = 16;

type AvailabilityWrite = { roomTypeId: string; date: string; price: string; roomsAvailable: number; defaultRoomsAvailable: number };

function availabilityWriteStatements(db: D1ScopedDatabase, rows: AvailabilityWrite[], action: "allotment" | "stop_sell") {
  const statements = [];
  for (let start = 0; start < rows.length; start += AVAILABILITY_ROWS_PER_STATEMENT) {
    const chunk = rows.slice(start, start + AVAILABILITY_ROWS_PER_STATEMENT);
    const params = chunk.flatMap(row => [
      crypto.randomUUID(), row.roomTypeId, row.date, row.price, row.roomsAvailable,
      action === "stop_sell" && row.roomsAvailable === 0 ? row.defaultRoomsAvailable : null,
    ]);
    const inventoryUpdate = action === "stop_sell"
      ? `rooms_available = case
           when excluded.rooms_available = 0 then 0
           when availability.rooms_available = 0 then coalesce(availability.reopen_rooms_available, excluded.rooms_available)
           else availability.rooms_available end,
         reopen_rooms_available = case
           when excluded.rooms_available = 0 and availability.rooms_available > 0 then availability.rooms_available
           when excluded.rooms_available = 0 then availability.reopen_rooms_available
           else null end`
      : `rooms_available = excluded.rooms_available, reopen_rooms_available = null`;
    statements.push(db.$client.prepare(
      `insert into availability (id, room_type_id, date, price, rooms_available, reopen_rooms_available) values ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
       on conflict (room_type_id, date) do update set ${inventoryUpdate}`,
    ).bind(...params));
  }
  return statements;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
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
  input: { hotelId: string; roomTypeIds: string[]; startDate: string; endDate: string; roomsAvailable: number; action?: "allotment" | "stop_sell" },
  now = new Date(),
) {
  const action = input.action ?? (input.roomsAvailable === 0 ? "stop_sell" : "allotment");
  const permission = action === "stop_sell" ? "revenue.manage_stop_sell" : "revenue.manage_allotment";
  await authorizeHotelAction(db, caller, input.hotelId, permission, "availability.update_batch", now);
  const roomTypeIds = Array.from(new Set(input.roomTypeIds));
  if (!roomTypeIds.length || roomTypeIds.length > AVAILABILITY_BATCH_MAX_ROOM_TYPES) throw new TRPCError({ code: "BAD_REQUEST", message: `Choose between 1 and ${AVAILABILITY_BATCH_MAX_ROOM_TYPES} room types.` });
  if (!Number.isInteger(input.roomsAvailable) || input.roomsAvailable < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Rooms available must be a whole number, 0 or more." });
  if (action === "allotment" && input.roomsAvailable === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Use the stop-sell action to close online sales." });
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

  const rowsToWrite = types.flatMap(type => dates.map(date => ({ roomTypeId: type.id, date, price: canonicalMoney(String(type.basePrice)), roomsAvailable: input.roomsAvailable, defaultRoomsAvailable: totalByType.get(type.id) ?? 0 })));
  const statements = availabilityWriteStatements(db, rowsToWrite, action);
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
  await authorizeRoomType(db, caller, hotelId, roomTypeId, "revenue.manage_pricing_rules", "rate_overrides.read", now);
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
  const scope = await authorizeHotelAction(db, caller, hotelId, "revenue.manage_pricing_rules", "rate_overrides.list", now);
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
  await authorizeRoomType(db, caller, input.hotelId, input.roomTypeId, "revenue.manage_pricing_rules", "rate_overrides.create", now);
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
  await authorizeHotelAction(db, caller, hotelId, "revenue.manage_pricing_rules", "rate_overrides.delete", now);
  const [row] = await db.delete(rateOverrides).where(and(
    eq(rateOverrides.id, rateOverrideId),
    sql`${rateOverrides.roomTypeId} in (select id from room_types where hotel_id = ${hotelId})`,
  )).returning({ id: rateOverrides.id });
  return row ?? null;
}

export async function saveCalendarRange(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: {
    hotelId: string;
    roomTypeIds: string[];
    startDate: string;
    endDate: string;
    roomsAvailable?: number | null;
    availabilityAction?: "allotment" | "stop_sell";
    price?: string | null;
    minStayNights?: number | null;
    base?: boolean;
  },
  now = new Date(),
) {
  const touchesRates = input.base === true || (input.price !== undefined && input.price !== null) || input.minStayNights !== undefined;
  if (touchesRates) await authorizeHotelAction(db, caller, input.hotelId, "revenue.manage_rates", "calendar.save", now);
  const availabilityAction = input.availabilityAction ?? (input.roomsAvailable === 0 ? "stop_sell" : "allotment");
  if (input.roomsAvailable !== undefined && input.roomsAvailable !== null) {
    if (!Number.isInteger(input.roomsAvailable) || input.roomsAvailable < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Rooms available must be a whole number, 0 or more." });
    if (availabilityAction === "allotment" && input.roomsAvailable === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Use the stop-sell action to close online sales." });
    await authorizeHotelAction(db, caller, input.hotelId, availabilityAction === "stop_sell" ? "revenue.manage_stop_sell" : "revenue.manage_allotment", "calendar.save", now);
  }
  if (!touchesRates && (input.roomsAvailable === undefined || input.roomsAvailable === null)) await authorizeHotelAction(db, caller, input.hotelId, "revenue.manage_allotment", "calendar.save", now);
  const roomTypeIds = Array.from(new Set(input.roomTypeIds));
  if (!roomTypeIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one room type." });
  const types = await db.select({ id: roomTypes.id, basePrice: roomTypes.basePrice }).from(roomTypes)
    .where(and(eq(roomTypes.hotelId, input.hotelId), inArray(roomTypes.id, roomTypeIds)));
  if (types.length !== roomTypeIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Room type not found." });

  const statements: any[] = [];
  // rooms available
  if (input.roomsAvailable !== undefined && input.roomsAvailable !== null) {
    const dates = datesBetween(input.startDate, input.endDate);
    if (!dates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date range." });
    const roomCounts = await db.select({ roomTypeId: rooms.roomTypeId, total: sql<number>`count(*)` }).from(rooms)
      .where(and(eq(rooms.hotelId, input.hotelId), inArray(rooms.roomTypeId, roomTypeIds))).groupBy(rooms.roomTypeId);
    const totalByType = new Map(roomCounts.map(row => [row.roomTypeId, Number(row.total)]));
    const rowsToWrite = types.flatMap(type => dates.map(date => ({
      roomTypeId: type.id, date, price: canonicalMoney(String(type.basePrice)), roomsAvailable: input.roomsAvailable!,
      defaultRoomsAvailable: totalByType.get(type.id) ?? 0,
    })));
    statements.push(...availabilityWriteStatements(db, rowsToWrite, availabilityAction));
  }

  // rate overrides
  const touchRates = input.base === true || (input.price !== undefined && input.price !== null) || input.minStayNights !== undefined;
  if (touchRates) {
    for (const type of types) {
      const existing = await db.select().from(rateOverrides).where(eq(rateOverrides.roomTypeId, type.id));
      const overlapping = existing.filter(r => !(r.endDate < input.startDate || r.startDate > input.endDate));
      if (input.price === null && input.minStayNights === undefined && input.base !== true) continue;
      let replacements: Array<{ start_date: string; end_date: string; override_price?: string; min_stay_nights?: number | null }>;
      if (input.base === true) {
        replacements = [];
      } else if (input.price !== undefined && input.price !== null) {
        replacements = [{ start_date: input.startDate, end_date: input.endDate, override_price: String(input.price), min_stay_nights: input.minStayNights ?? null }];
      } else if (input.minStayNights !== undefined) {
        // Preserve each night's resolved guest rate, including the base rate, while changing only minimum stay.
        const dates = datesBetween(input.startDate, input.endDate);
        const nightly = dates.map(date => {
          const satang = resolveRateSatang(type.id, type.basePrice, date, existing);
          return { date, price: `${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, "0")}` };
        });
        replacements = [];
        for (const night of nightly) {
          const previous = replacements[replacements.length - 1];
          if (previous && previous.override_price === night.price && nextDay(previous.end_date) === night.date) previous.end_date = night.date;
          else replacements.push({ start_date: night.date, end_date: night.date, override_price: night.price, min_stay_nights: input.minStayNights });
        }
      } else {
        continue;
      }
      const split = splitRateRanges(
        overlapping.map(r => ({ id: r.id, start_date: r.startDate, end_date: r.endDate, override_price: r.overridePrice, min_stay_nights: r.minStayNights })),
        input.base === true ? { start_date: input.startDate, end_date: input.endDate, base: true } : replacements,
      );
      for (const id of split.deleteIds) statements.push(db.$client.prepare("delete from rate_overrides where id = ?").bind(id));
      for (const c of split.create) {
        if (c.override_price === undefined) continue;
        statements.push(db.$client.prepare("insert into rate_overrides (id, room_type_id, start_date, end_date, override_price, min_stay_nights) values (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), type.id, c.start_date, c.end_date, canonicalMoney(c.override_price), c.min_stay_nights));
      }
    }
  }

  if (statements.length) await db.$client.batch(statements);
  return { success: true as const };
}

export async function listCalendarForHotel(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  startDate: string,
  endDate: string,
  now = new Date(),
) {
  const scope = await authorizeAvailabilityRead(db, caller, hotelId, "calendar.read", now);
  const canSeePrice = scope.permissions.includes("revenue.manage_rates");
  const canManageAllotment = scope.permissions.includes("revenue.manage_allotment");
  const canManageStopSell = scope.permissions.includes("revenue.manage_stop_sell");
  const types = await db.select({ id: roomTypes.id, name: roomTypes.name, basePrice: roomTypes.basePrice }).from(roomTypes).where(eq(roomTypes.hotelId, hotelId));
  const totalByType = new Map((await db.select({ roomTypeId: rooms.roomTypeId, total: sql<number>`count(*)` }).from(rooms).where(eq(rooms.hotelId, hotelId)).groupBy(rooms.roomTypeId)).map(r => [r.roomTypeId, Number(r.total)]));
  const availRows = await db.select().from(availability).where(and(inArray(availability.roomTypeId, types.map(t => t.id)), sql`${availability.date} >= ${startDate} and ${availability.date} <= ${endDate}`));
  const overrides = await db.select().from(rateOverrides).where(inArray(rateOverrides.roomTypeId, types.map(t => t.id)));
  const availMap = new Map(availRows.map(r => [`${r.roomTypeId}:${r.date}`, r]));
  // bookings in range
  const bookingRows = await db.select({ roomId: bookings.roomId, checkIn: bookings.checkIn, checkOut: bookings.checkOut, status: bookings.status, expiresAt: bookings.expiresAt }).from(bookings).where(and(eq(bookings.hotelId, hotelId), sql`${bookings.checkIn} < ${nextDay(endDate)} and ${bookings.checkOut} > ${startDate}`));
  const roomTypeByRoom = new Map((await db.select({ id: rooms.id, roomTypeId: rooms.roomTypeId }).from(rooms).where(eq(rooms.hotelId, hotelId))).map(r => [r.id, r.roomTypeId]));
  const bookedMap = new Map<string, number>();
  for (const b of bookingRows) {
    if (!b.roomId) continue;
    const rt = roomTypeByRoom.get(b.roomId);
    if (!rt) continue;
    if (!isBookingOccupyingInventory({ status: b.status as any, expiresAt: b.expiresAt ? new Date(b.expiresAt).toISOString() : null })) continue;
    // increment each date in [checkIn, checkOut)
    for (let d = b.checkIn; d < b.checkOut; d = nextDay(d)) {
      if (d < startDate || d > endDate) continue;
      const key = `${rt}:${d}`;
      bookedMap.set(key, (bookedMap.get(key) ?? 0) + 1);
    }
  }
  const result: any[] = [];
  for (const type of types) {
    const typeOverrides = overrides.filter(o => o.roomTypeId === type.id);
    const dates = datesBetween(startDate, endDate);
    const total = totalByType.get(type.id) ?? 0;
    for (const date of dates) {
      const a = availMap.get(`${type.id}:${date}`);
      const booked = bookedMap.get(`${type.id}:${date}`) ?? 0;
      const cap = a ? a.roomsAvailable : total;
      const available = Math.max(0, Math.min(cap, total) - booked);
      const closed = !!a && a.roomsAvailable === 0;
      let price: string | null = null;
      if (canSeePrice) {
        const satang = resolveRateSatang(type.id, type.basePrice, date, typeOverrides);
        price = `${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, '0')}`;
      }
      result.push({
        roomTypeId: type.id,
        roomTypeName: type.name,
        date,
        roomsAvailable: a?.roomsAvailable ?? total,
        totalRooms: total,
        bookedRooms: booked,
        availableRooms: available,
        closed,
        price,
      });
    }
  }
  return { canSeePrice, canManageAllotment, canManageStopSell, rows: result };
}

async function authorizeAvailabilityRead(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, action: string, now: Date) {
  for (const permission of ["operations.view_bookings", "revenue.manage_rates", "revenue.manage_allotment", "revenue.manage_stop_sell"] as const) {
    try { return await authorizeHotelAction(db, caller, hotelId, permission, action, now); }
    catch (error) {
      if (!(error instanceof TRPCError) || error.code !== "FORBIDDEN") throw error;
    }
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view this calendar." });
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

async function authorizeRoomType(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, roomTypeId: string, permission: Permission, action: string, now: Date) {
  await authorizeHotelAction(db, caller, hotelId, permission, action, now);
  const [roomType] = await db.select({ id: roomTypes.id, basePrice: roomTypes.basePrice }).from(roomTypes).where(and(
    eq(roomTypes.id, roomTypeId), eq(roomTypes.hotelId, hotelId),
  )).limit(1);
  if (!roomType) throw new TRPCError({ code: "NOT_FOUND", message: "Room type not found." });
  return roomType;
}
