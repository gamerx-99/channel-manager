import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { bookings, bookingServices, bookingStatusLog, guests as guestTable, hotelPaymentSettings, hotels, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import { assertValidTransition, type BookingStatus } from "@shared/bookingLifecycle";
import type { ChildMeasurement, OccupancyPricingRules } from "@shared/occupancyPricing";
import type { BookingRecord, BookingServiceRecord, CreatePublicBookingInput, GuestRecord } from "../db/types";
import { moneyToSatang, satangToMoney } from "../db/money";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { calculateServiceTotalSatang, getPublicHotelBySlug, getPublicRoomTypeAvailabilityForGuests, priceBaseStaySatang, priceStayForRoomType, roundAverageNightlySatang, transitionBookingStatus } from "./bookingService";
import { getRequiredMinStayNights } from "../pricing";

const noAvailability = () => new TRPCError({ code: "BAD_REQUEST", message: "The selected room type is no longer available for the requested dates. Please choose another date or room type." });
const holdStatuses = ["held", "pending_payment", "pending_verification"] as const;

import { getStayDates } from "@shared/stayDates";
export { getStayDates } from "@shared/stayDates";

function publicContext(caller: D1CallerContext) {
  if (caller.access !== "public") throw new TRPCError({ code: "FORBIDDEN", message: "A server-created public booking context is required." });
}

function iso(value: Date | null | undefined) { return value?.toISOString() ?? null; }

async function maybeAuthorize(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, permission: "operations.manage_guests" | "property.view_financials", action: string, now = new Date()) {
  try { await authorizeHotelAction(db, caller, hotelId, permission, action, now); return true; }
  catch (error) { if (error instanceof TRPCError && error.code === "FORBIDDEN") return false; throw error; }
}

export async function listBookingsForHotel(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.view_bookings", "bookings.list", now);
  const [hasGuestAccess, hasFinancialAccess] = await Promise.all([
    maybeAuthorize(db, caller, hotelId, "operations.manage_guests", "guests.list_in_bookings", now),
    maybeAuthorize(db, caller, hotelId, "property.view_financials", "booking_values.list", now),
  ]);
  const bookingRows = await db.select().from(bookings).where(eq(bookings.hotelId, hotelId)).orderBy(desc(bookings.checkIn));
  const roomIds = Array.from(new Set(bookingRows.flatMap(row => row.roomId ? [row.roomId] : [])));
  const [roomRows, guestRows] = await Promise.all([
    roomIds.length ? db.select({ id: rooms.id, roomNumber: rooms.roomNumber, roomTypeId: rooms.roomTypeId }).from(rooms).where(inArray(rooms.id, roomIds)) : Promise.resolve([]),
    hasGuestAccess && bookingRows.length ? db.select().from(guestTable).innerJoin(bookings, eq(guestTable.bookingId, bookings.id)).where(eq(bookings.hotelId, hotelId)) : Promise.resolve([]),
  ]);
  const typeIds = Array.from(new Set(roomRows.flatMap(row => row.roomTypeId ? [row.roomTypeId] : [])));
  const typeRows = typeIds.length ? await db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(inArray(roomTypes.id, typeIds)) : [];
  const roomsById = new Map(roomRows.map(row => [row.id, row]));
  const typesById = new Map(typeRows.map(row => [row.id, row]));
  const guestsByBooking = new Map<string, GuestRecord[]>();
  for (const { guests: row } of guestRows) {
    const values = guestsByBooking.get(row.bookingId) ?? [];
    values.push({ id: row.id, booking_id: row.bookingId, first_name: row.firstName, middle_name: row.middleName, last_name: row.lastName, gender: row.gender as GuestRecord["gender"], passport_no: row.passportNo, nationality_code: row.nationalityCode, birth_date: row.birthDate, phone_no: row.phoneNo });
    guestsByBooking.set(row.bookingId, values);
  }
  return bookingRows.map(row => {
    const room = row.roomId ? roomsById.get(row.roomId) : null;
    const roomType = room?.roomTypeId ? typesById.get(room.roomTypeId) : null;
    return {
      id: row.id, hotel_id: row.hotelId, room_id: row.roomId, guest_name: row.guestName,
      check_in: row.checkIn, check_out: row.checkOut, price: hasFinancialAccess ? row.price : null,
      source: row.source, status: row.status, created_at: row.createdAt.toISOString(),
      rooms: room ? { room_number: room.roomNumber, room_types: roomType ? { name: roomType.name } : null } : null,
      guests: guestsByBooking.get(row.id) ?? [],
    };
  });
}

export async function getPublicHotelAvailability(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  slug: string,
  checkIn: string,
  checkOut: string,
  guestCounts: { adults: number; children: ChildMeasurement[] } = { adults: 2, children: [] },
) {
  publicContext(caller);
  const stayDates = getStayDates(checkIn, checkOut);
  if (!stayDates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  const hotel = await getPublicHotelBySlug(db, caller, slug);
  const available = await getPublicRoomTypeAvailabilityForGuests(db, caller, hotel.id, checkIn, checkOut, guestCounts.adults, guestCounts.children);
  const counts = new Map(available.map(row => [row.room_type_id, row.rooms_available]));
  const types = await db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotel.id));
  types.sort((left, right) => {
    const leftPrice = moneyToSatang(left.basePrice);
    const rightPrice = moneyToSatang(right.basePrice);
    return leftPrice === rightPrice ? left.id.localeCompare(right.id) : leftPrice < rightPrice ? -1 : 1;
  });
  const output = [];
  for (const roomType of types) {
    const roomsAvailable = counts.get(roomType.id) ?? 0;
    if (!roomsAvailable) continue;
    const result = await priceStayForRoomType(db, roomType, checkIn, checkOut, guestCounts.adults, guestCounts.children);
    const violatesMinimum = result.minimum != null && result.stayDates.length < result.minimum;
    output.push({
      id: roomType.id, name: roomType.name, capacity: roomType.maxOccupancy,
      base_price: roomType.basePrice, total_price: satangToMoney(result.pricing.totalPrice),
      avg_nightly_price: satangToMoney(roundAverageNightlySatang(result.pricing.totalPrice, result.stayDates.length)),
      nights: result.stayDates.length, rooms_available: roomsAvailable,
      min_stay_nights: result.minimum, is_available: !violatesMinimum,
      min_stay_violated: violatesMinimum, nightly_prices: result.pricing.nightlyPrices.map(satangToMoney),
    });
  }
  return { hotel, check_in: checkIn, check_out: checkOut, nights: stayDates.length, room_types: output };
}

export async function createPublicBooking(db: D1ScopedDatabase, caller: D1CallerContext, input: CreatePublicBookingInput, now = new Date()) {
  publicContext(caller);
  const dates = getStayDates(input.check_in, input.check_out);
  if (!dates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  const hotel = await getPublicHotelBySlug(db, caller, input.slug);
  const [roomType] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, hotel.id))).limit(1);
  if (!roomType) throw new TRPCError({ code: "NOT_FOUND", message: "Selected room type does not exist for this hotel." });
  const result = await priceBaseStaySatang(db, roomType, input.check_in, input.check_out, dates);
  if (result.minimum != null && dates.length < result.minimum) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Booking must be at least ${result.minimum} night${result.minimum === 1 ? "" : "s"} (minimum stay for selected dates is ${result.minimum} night${result.minimum === 1 ? "" : "s"}).` });
  }
  const amount = result.total;
  const guestName = input.guest_name.trim();
  const parts = guestName.split(/\s+/);
  const bookingId = crypto.randomUUID();
  const guest = { first_name: parts[0] || "Guest", last_name: parts.slice(1).join(" ") || "-", middle_name: null, gender: null, passport_no: "DIRECT-BOOKING", nationality_code: "THA", birth_date: "2000-01-01", phone_no: input.guest_phone || null } as Omit<GuestRecord, "id" | "booking_id">;
  const [inserted] = await atomicInsert(db, {
    id: bookingId, hotelId: hotel.id, roomId: null, roomTypeId: roomType.id,
    guestName, checkIn: input.check_in, checkOut: input.check_out, price: satangToMoney(amount),
    source: "walk-in", status: "confirmed", expiresAt: null, adults: null, children: null,
    public: true, guests: [guest], services: [], changedBy: caller.userId || null, reason: null,
  }, now);
  if (inserted.meta.changes !== 1) throw noAvailability();
  const [created] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!created?.roomId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking insert did not return a room." });
  const [[assignedRoom], [payment]] = await Promise.all([
    db.select({ roomNumber: rooms.roomNumber }).from(rooms).where(eq(rooms.id, created.roomId)).limit(1),
    db.select({ promptpayId: hotelPaymentSettings.promptpayId }).from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotel.id)).limit(1),
  ]);
  return { success: true, booking_id: bookingId, hotel_id: hotel.id, hotel_name: hotel.name, hotel_address: hotel.address, room_type_name: roomType.name, room_number: assignedRoom?.roomNumber ?? "", check_in: input.check_in, check_out: input.check_out, nights: dates.length, total_price: satangToMoney(amount), guest_name: guestName, guest_email: input.guest_email || null, guest_phone: input.guest_phone || null, has_promptpay: Boolean(payment?.promptpayId) };
}

export async function logBookingStatusChange(db: D1ScopedDatabase, caller: D1CallerContext, input: { booking_id: string; hotel_id: string; from_status: BookingStatus | null; to_status: BookingStatus; changed_by?: string | null; reason?: string | null }, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_bookings", "bookings.status_log.create", now);
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const [row] = await db.insert(bookingStatusLog).values({ bookingId: input.booking_id, fromStatus: input.from_status, toStatus: input.to_status, changedBy: caller.userId || null, reason: input.reason ?? null }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking status log insert returned no record." });
}

export { transitionBookingStatus };

export async function expireBookingIfPast(db: D1ScopedDatabase, caller: D1CallerContext, bookingId: string, hotelId: string, now = new Date()) {
  if (caller.access === "public") {
    const [hotel] = await db.select({ slug: hotels.slug, publicEnabled: hotels.publicEnabled }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    if (!hotel?.publicEnabled) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  } else {
    await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "bookings.expire", now);
  }
  const [row] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.hotelId, hotelId))).limit(1);
  if (!row) return null;
  const status = row.status as BookingStatus;
  const expiresAt = iso(row.expiresAt);
  if (!holdStatuses.includes(status as typeof holdStatuses[number]) || row.expiresAt == null || row.expiresAt.getTime() >= now.getTime()) return { status, expires_at: expiresAt };
  try { assertValidTransition(status, "expired"); } catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Booking cannot expire from status ${status}.` }); }
  const [updated, audit] = await db.$client.batch([
    db.$client.prepare("update bookings set status = 'expired' where id = ? and hotel_id = ? and status = ? and expires_at < ?").bind(bookingId, hotelId, status, now.getTime()),
    db.$client.prepare(`insert into booking_status_log (id, booking_id, from_status, to_status, reason)
      select ?, ?, ?, 'expired', 'timer_expired' where changes() = 1`).bind(crypto.randomUUID(), bookingId, status),
  ]);
  if (updated.meta.changes !== 1 || audit.meta.changes !== 1) {
    const [latest] = await db.select({ status: bookings.status, expiresAt: bookings.expiresAt }).from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.hotelId, hotelId))).limit(1);
    return latest ? { status: latest.status as BookingStatus, expires_at: iso(latest.expiresAt) } : null;
  }
  return { status: "expired" as const, expires_at: expiresAt };
}

export async function holdRoomType(db: D1ScopedDatabase, caller: D1CallerContext, input: { slug: string; room_type_id: string; check_in: string; check_out: string; adults: number; children: ChildMeasurement[] }, now = new Date()) {
  publicContext(caller);
  const dates = getStayDates(input.check_in, input.check_out);
  if (!dates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  const hotel = await getPublicHotelBySlug(db, caller, input.slug);
  const [roomType] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, hotel.id))).limit(1);
  if (!roomType) throw new TRPCError({ code: "NOT_FOUND", message: "Selected room type does not exist for this hotel." });
  const result = await priceStayForRoomType(db, roomType, input.check_in, input.check_out, input.adults, input.children);
  const guests = input.adults + result.classification.adultEquivalentCount + (roomType.childrenCountTowardMax ? result.classification.qualifyingChildren : 0);
  if (guests > roomType.maxOccupancy || !(roomType.occupancyPricing as OccupancyPricingRules["occupancy_pricing"])[String(guests)]?.enabled) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room type cannot fit this guest count." });
  if (result.minimum != null && dates.length < result.minimum) throw new TRPCError({ code: "BAD_REQUEST", message: `Booking must be at least ${result.minimum} night${result.minimum === 1 ? "" : "s"} (minimum stay for selected dates is ${result.minimum} night${result.minimum === 1 ? "" : "s"}).` });
  const [settings] = await db.select({ holdTimeoutMinutes: hotelPaymentSettings.holdTimeoutMinutes }).from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotel.id)).limit(1);
  const expiresAt = new Date(now.getTime() + (settings?.holdTimeoutMinutes ?? 15) * 60_000);
  const bookingId = crypto.randomUUID();
  const [inserted] = await atomicInsert(db, { id: bookingId, hotelId: hotel.id, roomId: null, roomTypeId: roomType.id, guestName: "", checkIn: input.check_in, checkOut: input.check_out, price: satangToMoney(result.pricing.totalPrice), source: "manual", status: "held", expiresAt, adults: input.adults, children: input.children.length, public: true, guests: [], services: [], changedBy: caller.userId || null, reason: "public_hold_created" }, now);
  if (inserted.meta.changes !== 1) throw noAvailability();
  const [created] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  const [room] = created?.roomId ? await db.select({ roomNumber: rooms.roomNumber }).from(rooms).where(eq(rooms.id, created.roomId)).limit(1) : [];
  if (!room) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking hold insert did not return an assigned room." });
  return { booking_id: bookingId, hotel_id: hotel.id, room_id: created!.roomId!, expires_at: expiresAt.toISOString(), room_type_name: roomType.name, room_number: room.roomNumber, total_price: satangToMoney(result.pricing.totalPrice), nights: dates.length };
}

export async function confirmBookingDetails(db: D1ScopedDatabase, caller: D1CallerContext, input: { booking_id: string; hotel_id: string; guest_name: string; guest_email?: string | null; guest_phone?: string | null; special_requests?: string | null; services?: Array<{ service_name: string; pricing_model: "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME"; unit_price: string | number; quantity: number }> }, now = new Date()) {
  publicContext(caller);
  const [hotel] = await db.select({ id: hotels.id, slug: hotels.slug, publicEnabled: hotels.publicEnabled }).from(hotels).where(and(eq(hotels.id, input.hotel_id), eq(hotels.publicEnabled, true))).limit(1);
  if (!hotel) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const expired = await expireBookingIfPast(db, caller, input.booking_id, input.hotel_id, now);
  if (!expired || expired.status !== "held") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This room hold has expired or is no longer available. Please start again." });
  const nights = getStayDates(booking.checkIn, booking.checkOut).length;
  const services = input.services ?? [];
  const serviceAmounts = services.map(service => calculateServiceTotalSatang(service, nights));
  const serviceTotal = serviceAmounts.reduce((sum, value) => sum + value, BigInt(0));
  const total = moneyToSatang(booking.price) + serviceTotal;
  const [settings] = await db.select({ paymentTimeoutMinutes: hotelPaymentSettings.paymentTimeoutMinutes }).from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, input.hotel_id)).limit(1);
  const expiresAt = new Date(now.getTime() + (settings?.paymentTimeoutMinutes ?? 15) * 60_000);
  const statements = [db.$client.prepare(`update bookings set guest_name = ?, status = 'pending_payment', expires_at = ?, price = ?
      where id = ? and hotel_id = ? and status = 'held' and (expires_at is null or expires_at >= ?)`)
    .bind(input.guest_name.trim(), expiresAt.getTime(), satangToMoney(total), input.booking_id, input.hotel_id, now.getTime())];
  services.forEach((service, index) => statements.push(db.$client.prepare(`insert into booking_services
      (id, booking_id, service_name, pricing_model, unit_price, quantity, total_price)
      select ?, ?, ?, ?, ?, ?, ? where changes() = 1`)
    .bind(crypto.randomUUID(), input.booking_id, service.service_name, service.pricing_model, satangToMoney(moneyToSatang(String(service.unit_price))), service.quantity, satangToMoney(serviceAmounts[index]!))));
  statements.push(db.$client.prepare(`insert into booking_status_log (id, booking_id, from_status, to_status, changed_by, reason)
      select ?, ?, 'held', 'pending_payment', ?, 'guest_details_confirmed' where changes() = 1`)
    .bind(crypto.randomUUID(), input.booking_id, caller.userId || null));
  const results = await db.$client.batch(statements);
  const update = results[0];
  const audit = results.at(-1)!;
  if (update.meta.changes !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This room hold has expired or is no longer available. Please start again." });
  if (audit.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking confirmation audit was not written." });
  return { booking_id: input.booking_id, hotel_id: input.hotel_id, status: "pending_payment" as const, expires_at: expiresAt.toISOString(), amount: satangToMoney(total) };
}

export async function createBookingWithGuests(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  booking: Omit<BookingRecord, "id" | "created_at" | "rooms" | "guests" | "services">,
  guestInputs: Omit<GuestRecord, "id" | "booking_id">[],
  services: Omit<BookingServiceRecord, "id" | "booking_id" | "created_at">[] = [],
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, booking.hotel_id, "operations.manage_bookings", "bookings.create", now);
  if (guestInputs.length) await authorizeHotelAction(db, caller, booking.hotel_id, "operations.manage_guests", "guests.create", now);
  if (!getStayDates(booking.check_in, booking.check_out).length) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  if (booking.source === "ota_ical") throw new TRPCError({ code: "BAD_REQUEST", message: "OTA calendar blocks must be created by the calendar sync repository." });
  if (booking.room_id) {
    const [room] = await db.select({ roomTypeId: rooms.roomTypeId }).from(rooms).where(and(eq(rooms.id, booking.room_id), eq(rooms.hotelId, booking.hotel_id))).limit(1);
    if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found." });
    const overrides = await db.select().from(rateOverrides).where(eq(rateOverrides.roomTypeId, room.roomTypeId));
    const required = getRequiredMinStayNights(booking.check_in, booking.check_out, overrides.map(row => ({ id: row.id, room_type_id: row.roomTypeId, start_date: row.startDate, end_date: row.endDate, override_price: row.overridePrice, min_stay_nights: row.minStayNights, created_at: row.createdAt.toISOString() })));
    const nights = getStayDates(booking.check_in, booking.check_out).length;
    if (required != null && nights < required) throw new TRPCError({ code: "BAD_REQUEST", message: `Booking must be at least ${required} night${required === 1 ? "" : "s"}.` });
  }
  const status = booking.status;
  try { assertValidTransition(status, status); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Booking status is invalid." }); }
  const id = crypto.randomUUID();
  const result = await atomicInsert(db, { id, hotelId: booking.hotel_id, roomId: booking.room_id, roomTypeId: null, guestName: booking.guest_name, checkIn: booking.check_in, checkOut: booking.check_out, price: canonicalBookingPrice(booking.price), source: booking.source, status, expiresAt: null, adults: booking.adults_count ?? null, children: booking.children_count ?? null, public: false, guests: guestInputs, services, changedBy: caller.userId || null, reason: "booking_created" }, now);
  if (result[0]!.meta.changes !== 1) throw noAvailability();
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking insert did not return a record." });
  return { id: row.id, hotel_id: row.hotelId, room_id: row.roomId, guest_name: row.guestName, check_in: row.checkIn, check_out: row.checkOut, price: row.price, source: row.source, status: row.status, created_at: row.createdAt.toISOString() };
}

function canonicalBookingPrice(value: string | number) {
  const satang = moneyToSatang(String(value));
  if (satang < BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Booking price cannot be negative." });
  return satangToMoney(satang);
}

async function atomicInsert(db: D1ScopedDatabase, input: {
  id: string; hotelId: string; roomId: string | null; roomTypeId: string | null; guestName: string;
  checkIn: string; checkOut: string; price: string; source: string; status: BookingStatus; expiresAt: Date | null;
  adults: number | null; children: number | null; public: boolean;
  guests: Array<Omit<GuestRecord, "id" | "booking_id">>;
  services: Array<Omit<BookingServiceRecord, "id" | "booking_id" | "created_at">>;
  changedBy: string | null; reason: string | null;
}, now: Date) {
  const bookingInsert = input.public
    ? db.$client.prepare(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, expires_at, adults_count, children_count, created_by)
        select ?, ?, r.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? from rooms r join hotels h on h.id = r.hotel_id
        where r.hotel_id = ? and r.room_type_id = ? and r.status <> 'maintenance' and h.public_enabled = 1
          and not exists (select 1 from bookings b where b.room_id = r.id and b.check_in < ? and b.check_out > ?
            and (b.status in ('confirmed', 'checked_in') or (b.status in ('held', 'pending_payment', 'pending_verification') and (b.expires_at is null or b.expires_at >= ?))))
        order by r.room_number limit 1`)
      .bind(input.id, input.hotelId, input.guestName, input.checkIn, input.checkOut, input.price, input.source, input.status, input.expiresAt?.getTime() ?? null, input.adults, input.children, input.changedBy, input.hotelId, input.roomTypeId, input.checkOut, input.checkIn, now.getTime())
    : db.$client.prepare(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, expires_at, adults_count, children_count, created_by)
        select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? from hotels h
        where h.id = ? and (? is null or exists (select 1 from rooms r where r.id = ? and r.hotel_id = ? and r.status <> 'maintenance'))
          and (? is null or not exists (select 1 from bookings b where b.room_id = ? and b.check_in < ? and b.check_out > ?
            and (b.status in ('confirmed', 'checked_in') or (b.status in ('held', 'pending_payment', 'pending_verification') and (b.expires_at is null or b.expires_at >= ?)))))`)
      .bind(input.id, input.hotelId, input.roomId, input.guestName, input.checkIn, input.checkOut, input.price, input.source, input.status, input.expiresAt?.getTime() ?? null, input.adults, input.children, input.changedBy, input.hotelId, input.roomId, input.roomId, input.hotelId, input.roomId, input.roomId, input.checkOut, input.checkIn, now.getTime());
  const statements = [bookingInsert];
  for (const guest of input.guests) statements.push(db.$client.prepare(`insert into guests (id, booking_id, first_name, middle_name, last_name, gender, passport_no, nationality_code, birth_date, phone_no)
      select ?, ?, ?, ?, ?, ?, ?, ?, ?, ? where changes() = 1`)
    .bind(crypto.randomUUID(), input.id, guest.first_name, guest.middle_name, guest.last_name, guest.gender, guest.passport_no, guest.nationality_code, guest.birth_date, guest.phone_no));
  for (const service of input.services) statements.push(db.$client.prepare(`insert into booking_services (id, booking_id, service_name, pricing_model, unit_price, quantity, total_price)
      select ?, ?, ?, ?, ?, ?, ? where changes() = 1`)
    .bind(crypto.randomUUID(), input.id, service.service_name, service.pricing_model, canonicalBookingPrice(service.unit_price), service.quantity, canonicalBookingPrice(service.total_price)));
  statements.push(db.$client.prepare(`insert into booking_status_log (id, booking_id, from_status, to_status, changed_by, reason)
      select ?, ?, null, ?, ?, ? where changes() = 1`)
    .bind(crypto.randomUUID(), input.id, input.status, input.changedBy, input.reason));
  return db.$client.batch(statements);
}

