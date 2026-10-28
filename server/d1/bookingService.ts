import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { bookings, hotels, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import { classifyGuests, type ChildMeasurement, type OccupancyPricingRules, type ChildRate } from "@shared/occupancyPricing";
import { assertValidTransition, type BookingStatus } from "@shared/bookingLifecycle";
import { authorizeHotelAction, requirePublicHotel, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { moneyToSatang, satangToMoney } from "../db/money";
import { getRequiredMinStayNights } from "../pricing";
import { getStayDates } from "@shared/stayDates";

const HOLD_STATUSES = ["held", "pending_payment", "pending_verification"] as const;
const INVENTORY_STATUSES = ["confirmed", "checked_in", ...HOLD_STATUSES] as const;

function tenPow(scale: number) {
  let result = BigInt(1);
  for (let i = 0; i < scale; i++) result *= BigInt(10);
  return result;
}

function positiveBigintRound(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * BigInt(2) >= denominator ? BigInt(1) : BigInt(0));
}

function decimalFraction(value: number | string): { numerator: bigint; scale: number } {
  const raw = String(value).trim().toLowerCase();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(raw);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Pricing adjustment is invalid." });
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const digits = BigInt(`${match[2]}${fraction}` || "0") * (match[1] === "-" ? BigInt(-1) : BigInt(1));
  const scale = fraction.length - exponent;
  if (scale <= 0) return { numerator: digits * tenPow(-scale), scale: 0 };
  return { numerator: digits, scale };
}

function scaledInteger(value: { numerator: bigint; scale: number }, commonScale: number): bigint {
  return value.numerator * tenPow(commonScale - value.scale);
}

/** Exact equivalent of shared occupancy pricing, returning one rounded satang amount per night. */
export function calculateNightPriceSatang(input: {
  nightlyRate: bigint;
  rules: OccupancyPricingRules;
  totalGuestCount: number;
  childRateCounts: { infant: number; age_groups: number[]; height: number };
}): bigint {
  const level = input.rules.occupancy_pricing[String(input.totalGuestCount)];
  if (!level?.enabled) throw new TRPCError({ code: "BAD_REQUEST", message: `Occupancy level ${input.totalGuestCount} is not bookable.` });
  const adjustment = decimalFraction(level.value);
  if (level.mode === "percent" && adjustment.numerator <= -BigInt(100) * tenPow(adjustment.scale)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Percent adjustment must be greater than -100%." });
  }

  const childRates: Array<{ count: number; rate: ChildRate }> = [
    { count: input.childRateCounts.infant, rate: input.rules.child_rates.infant },
    ...input.rules.child_rates.age_groups.map((rate, index) => ({ count: input.childRateCounts.age_groups[index] ?? 0, rate })),
    { count: input.childRateCounts.height, rate: input.rules.child_rates.height },
  ].filter(item => item.count > 0 && item.rate.mode !== "free");
  const percentTerms = [
    ...(level.mode === "percent" ? [{ count: 1, fraction: adjustment }] : []),
    ...childRates.filter(item => item.rate.mode === "percent").map(item => ({ count: item.count, fraction: decimalFraction(item.rate.value) })),
  ];
  const commonScale = Math.max(0, ...percentTerms.map(term => term.fraction.scale));
  const scaleFactor = tenPow(commonScale);
  const denominator = scaleFactor * BigInt(100);
  let totalNumerator: bigint;
  if (level.mode === "fixed") totalNumerator = (input.nightlyRate + moneyToSatang(String(level.value))) * denominator;
  else totalNumerator = input.nightlyRate * denominator;

  if (level.mode === "percent") totalNumerator += input.nightlyRate * scaledInteger(adjustment, commonScale);
  for (const item of childRates) {
    if (item.rate.mode === "fixed") {
      totalNumerator += moneyToSatang(String(item.rate.value)) * BigInt(item.count) * denominator;
    } else {
      totalNumerator += input.nightlyRate * scaledInteger(decimalFraction(item.rate.value), commonScale) * BigInt(item.count);
    }
  }
  if (totalNumerator < BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Total price cannot be negative after adjustments." });
  return positiveBigintRound(totalNumerator, denominator);
}

export function calculateStayPriceSatang(input: {
  nightlyRates: bigint[];
  rules: OccupancyPricingRules;
  totalGuestCount: number;
  childRateCounts: { infant: number; age_groups: number[]; height: number };
}) {
  const nightlyPrices = input.nightlyRates.map(nightlyRate => calculateNightPriceSatang({ ...input, nightlyRate }));
  return { nightlyPrices, totalPrice: nightlyPrices.reduce((sum, price) => sum + price, BigInt(0)) };
}

function publicForbidden(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "A server-created public booking context is required." });
}

export async function isPublishedHotel(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string): Promise<boolean> {
  if (caller.access !== "public") publicForbidden();
  const [hotel] = await db.select({ id: hotels.id }).from(hotels).where(and(eq(hotels.id, hotelId), eq(hotels.publicEnabled, true))).limit(1);
  return Boolean(hotel);
}

export async function getPublicHotelBySlug(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  const hotel = await requirePublicHotel(db, caller, slug);
  return { id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address };
}

export async function getPublicRoomTypeAvailability(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  checkIn: string,
  checkOut: string,
  now = new Date(),
) {
  if (!(await isPublishedHotel(db, caller, hotelId))) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found or not published." });
  if (!validStay(checkIn, checkOut)) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  return roomAvailabilityCounts(db, hotelId, checkIn, checkOut, now);
}

export async function getPublicRoomTypeAvailabilityForGuests(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: ChildMeasurement[],
  now = new Date(),
) {
  if (!(await isPublishedHotel(db, caller, hotelId))) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found or not published." });
  if (!validStay(checkIn, checkOut)) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out date must be after check-in date." });
  if (!Number.isInteger(adults) || adults < 1 || !Array.isArray(children) || children.length > 20) throw new TRPCError({ code: "BAD_REQUEST", message: "Guest counts are invalid." });
  const counts = await roomAvailabilityCounts(db, hotelId, checkIn, checkOut, now);
  const countByRoomType = new Map(counts.map(row => [row.room_type_id, row.rooms_available]));
  const types = await db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotelId));
  return types.flatMap(roomType => {
    const classification = classifyGuests(children, asOccupancyRules(roomType));
    const guests = adults + classification.adultEquivalentCount + (roomType.childrenCountTowardMax ? classification.qualifyingChildren : 0);
    const level = (roomType.occupancyPricing as OccupancyPricingRules["occupancy_pricing"])[String(guests)];
    const available = countByRoomType.get(roomType.id) ?? 0;
    return guests <= roomType.maxOccupancy && Boolean(level?.enabled) && available > 0
      ? [{ room_type_id: roomType.id, rooms_available: available }]
      : [];
  });
}

async function roomAvailabilityCounts(db: D1ScopedDatabase, hotelId: string, checkIn: string, checkOut: string, now: Date) {
  const roomTypesInHotel = await db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.hotelId, hotelId));
  const roomRows = await db.select({ id: rooms.id, roomTypeId: rooms.roomTypeId }).from(rooms).where(and(eq(rooms.hotelId, hotelId), ne(rooms.status, "maintenance")));
  const roomIds = roomRows.map(row => row.id);
  const statusRows = roomIds.length
    ? await db.select({ roomId: bookings.roomId, status: bookings.status, expiresAt: bookings.expiresAt }).from(bookings).where(and(
        eq(bookings.hotelId, hotelId), inArray(bookings.roomId, roomIds), lt(bookings.checkIn, checkOut), gt(bookings.checkOut, checkIn),
        inArray(bookings.status, INVENTORY_STATUSES),
      ))
    : [];
  const activeRoomIds = new Set(statusRows.filter(row => !HOLD_STATUSES.includes(row.status as typeof HOLD_STATUSES[number]) || row.expiresAt === null || row.expiresAt.getTime() >= now.getTime()).map(row => row.roomId));
  return roomTypesInHotel.map(roomType => {
    const roomIdsOfType = roomRows.filter(room => room.roomTypeId === roomType.id).map(room => room.id);
    const available = Math.max(0, roomIdsOfType.length - roomIdsOfType.filter(id => activeRoomIds.has(id)).length);
    return { room_type_id: roomType.id, rooms_available: available };
  });
}

export async function updateRoomTypeWithOccupancyConfig(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; room_type_id: string; name: string; capacity: number; base_price: string | number; occupancy_config: Record<string, unknown> },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "room_types.occupancy_config.update", now);
  const config = input.occupancy_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TRPCError({ code: "BAD_REQUEST", message: "Room type occupancy configuration is invalid." });
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Room capacity must be a positive integer." });
  const [current] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, input.hotel_id))).limit(1);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Room type not found." });
  const childRates = (config.child_rates ?? current.childRates) as typeof current.childRates;
  const occupancyPricing = (config.occupancy_pricing ?? current.occupancyPricing) as typeof current.occupancyPricing;
  const baseOccupancy = (config.base_occupancy as number | undefined) ?? current.baseOccupancy;
  const nextChildRule = (config.child_rule as string | undefined) ?? current.childRule;
  if (input.capacity !== current.capacity && (config.occupancy_pricing === undefined || config.child_rates === undefined)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A capacity change requires a complete occupancy pricing schedule and child rates." });
  }
  if (config.occupancy_pricing !== undefined && config.base_occupancy === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "Base occupancy is required when saving an occupancy pricing schedule." });
  if (config.max_occupancy !== undefined && config.max_occupancy !== input.capacity) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum occupancy must match room capacity." });
  if (config.occupancy_pricing !== undefined) {
    if (!occupancyPricing || typeof occupancyPricing !== "object" || Array.isArray(occupancyPricing)) throw new TRPCError({ code: "BAD_REQUEST", message: "Occupancy pricing must be an object." });
    const keys = Object.keys(occupancyPricing);
    if (keys.length !== input.capacity || keys.some(key => !/^[1-9]\d*$/.test(key) || Number(key) > input.capacity)) throw new TRPCError({ code: "BAD_REQUEST", message: "Occupancy pricing must define every guest count from one through room capacity." });
  }
  if (nextChildRule !== "age" && nextChildRule !== "height") throw new TRPCError({ code: "BAD_REQUEST", message: "Child measurement rule is invalid." });
  const ruleChanged = nextChildRule !== current.childRule;
  const childRuleLimit = Object.hasOwn(config, "child_rule_limit") ? config.child_rule_limit : ruleChanged ? null : current.childRuleLimit;
  const childRuleLimitText = childRuleLimit == null ? null : canonicalThreshold(String(childRuleLimit));
  if (nextChildRule === "height" && (!Object.hasOwn(config, "child_rule_limit") || childRuleLimitText == null || decimalFraction(childRuleLimitText).numerator <= BigInt(0))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Height rule requires a positive child rule limit in cm." });
  }
  const maxOccupancy = (config.max_occupancy as number | undefined) ?? input.capacity;
  const childrenCountTowardMax = (config.children_count_toward_max as boolean | undefined) ?? current.childrenCountTowardMax;
  const guard = ruleChanged
    ? db.$client.prepare(`update room_types set child_rule = ?, child_rule_limit = null where id = ? and hotel_id = ? and child_rule = ? and capacity = ?`)
      .bind(nextChildRule, input.room_type_id, input.hotel_id, current.childRule, current.capacity)
    : db.$client.prepare(`update room_types set child_rule = child_rule where id = ? and hotel_id = ? and child_rule = ? and capacity = ?`)
      .bind(input.room_type_id, input.hotel_id, current.childRule, current.capacity);
  const [guardResult, updateResult] = await db.$client.batch([
    guard,
    db.$client.prepare(`update room_types set name = ?, capacity = ?, base_price = ?, base_occupancy = ?, max_occupancy = ?, occupancy_pricing = ?, child_rule = ?, child_rule_limit = ?, child_rates = ?, children_count_toward_max = ?
        where id = ? and hotel_id = ? and changes() > 0`)
      .bind(input.name, input.capacity, canonicalMoney(String(input.base_price)), baseOccupancy, maxOccupancy, JSON.stringify(occupancyPricing), nextChildRule, childRuleLimitText, JSON.stringify(childRates), childrenCountTowardMax, input.room_type_id, input.hotel_id),
  ]);
  if (guardResult.meta.changes < 1) throw new TRPCError({ code: "CONFLICT", message: "Room type changed; reload and try again." });
  if (updateResult.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "Room type changed; reload and try again." });
  const [updated] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, input.hotel_id))).limit(1);
  if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Room type changed; reload and try again." });
  return updated;
}

export async function transitionBookingStatus(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { booking_id: string; hotel_id: string; to_status: "checked_in" | "checked_out" },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_checkin_checkout", "bookings.transition", now);
  if (input.to_status !== "checked_in" && input.to_status !== "checked_out") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unsupported booking status transition." });
  const [booking] = await db.select({ status: bookings.status }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  try { assertValidTransition(booking.status as BookingStatus, input.to_status); }
  catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Booking must be confirmed before check-in and checked in before check-out." }); }
  const [updated, audit] = await db.$client.batch([
    db.$client.prepare("update bookings set status = ? where id = ? and hotel_id = ? and status = ?").bind(input.to_status, input.booking_id, input.hotel_id, booking.status),
    db.$client.prepare(`insert into booking_status_log (id, booking_id, from_status, to_status, changed_by, reason)
      select ?, ?, ?, ?, ?, ? where changes() = 1`).bind(crypto.randomUUID(), input.booking_id, booking.status, input.to_status, caller.userId, input.to_status === "checked_in" ? "front_desk_check_in" : "front_desk_check_out"),
  ]);
  if (updated.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "Booking status changed; reload and try again." });
  if (audit.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking status audit was not written." });
  return { booking_id: input.booking_id, hotel_id: input.hotel_id, from_status: booking.status, to_status: input.to_status };
}

function validStay(checkIn: string, checkOut: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)
    && Number.isFinite(Date.parse(`${checkIn}T00:00:00.000Z`)) && Number.isFinite(Date.parse(`${checkOut}T00:00:00.000Z`)) && checkOut > checkIn;
}

function asOccupancyRules(row: typeof roomTypes.$inferSelect): OccupancyPricingRules {
  return { base_occupancy: row.baseOccupancy, max_occupancy: row.maxOccupancy, occupancy_pricing: row.occupancyPricing as OccupancyPricingRules["occupancy_pricing"], child_rule: row.childRule as OccupancyPricingRules["child_rule"], child_rule_limit: row.childRuleLimit, child_rates: row.childRates as OccupancyPricingRules["child_rates"], children_count_toward_max: row.childrenCountTowardMax };
}

function canonicalMoney(value: string): string { return satangToMoney(moneyToSatang(value)); }

function canonicalThreshold(value: string) {
  const match = /^\+?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Child height limit must be a nonnegative finite number." });
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Child height limit must be a nonnegative finite number." });
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  const expanded = decimalIndex <= 0 ? `0.${"0".repeat(-decimalIndex)}${digits}`
    : decimalIndex >= digits.length ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
      : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  const [integerPart, fractionalPart = ""] = expanded.split(".");
  const normalizedInteger = integerPart!.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fractionalPart.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

function resolveRateSatang(roomTypeId: string, basePrice: string, date: string, overrides: Array<typeof rateOverrides.$inferSelect>) {
  const matches = overrides.filter(row => row.roomTypeId === roomTypeId && date >= row.startDate && date <= row.endDate);
  if (!matches.length) return moneyToSatang(basePrice);
  const winner = matches.reduce((selected, candidate) => {
    const width = dateDistance(candidate.startDate, candidate.endDate);
    const selectedWidth = dateDistance(selected.startDate, selected.endDate);
    return width < selectedWidth
      || (width === selectedWidth && (candidate.createdAt.getTime() > selected.createdAt.getTime()
        || (candidate.createdAt.getTime() === selected.createdAt.getTime() && candidate.id > selected.id)))
      ? candidate
      : selected;
  });
  return moneyToSatang(winner.overridePrice);
}

function dateDistance(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export async function rateOverridesForPublicType(db: D1ScopedDatabase, roomTypeId: string) {
  return db.select().from(rateOverrides).where(eq(rateOverrides.roomTypeId, roomTypeId));
}

export async function priceStayForRoomType(db: D1ScopedDatabase, roomType: typeof roomTypes.$inferSelect, checkIn: string, checkOut: string, adults: number, children: ChildMeasurement[]) {
  const stayDates = getStayDates(checkIn, checkOut);
  const classification = classifyGuests(children, asOccupancyRules(roomType));
  const totalGuestCount = adults + classification.adultEquivalentCount + (roomType.childrenCountTowardMax ? classification.qualifyingChildren : 0);
  const overrides = await rateOverridesForPublicType(db, roomType.id);
  const nightlyRates = stayDates.map(date => resolveRateSatang(roomType.id, roomType.basePrice, date, overrides));
  const pricing = calculateStayPriceSatang({ nightlyRates, rules: asOccupancyRules(roomType), totalGuestCount, childRateCounts: classification.childRateCounts });
  const minimum = getRequiredMinStayNights(checkIn, checkOut, overrides.map(row => ({ id: row.id, room_type_id: row.roomTypeId, start_date: row.startDate, end_date: row.endDate, override_price: row.overridePrice, min_stay_nights: row.minStayNights, created_at: row.createdAt.toISOString() })));
  return { stayDates, classification, totalGuestCount, overrides, pricing, minimum };
}

export async function priceBaseStaySatang(db: D1ScopedDatabase, roomType: typeof roomTypes.$inferSelect, checkIn: string, checkOut: string, stayDates: string[]) {
  const overrides = await rateOverridesForPublicType(db, roomType.id);
  const nightlyRates = stayDates.map(date => resolveRateSatang(roomType.id, roomType.basePrice, date, overrides));
  const minimum = getRequiredMinStayNights(checkIn, checkOut, overrides.map(row => ({
    id: row.id, room_type_id: row.roomTypeId, start_date: row.startDate, end_date: row.endDate,
    override_price: row.overridePrice, min_stay_nights: row.minStayNights, created_at: row.createdAt.toISOString(),
  })));
  return { nightlyRates, total: nightlyRates.reduce((sum, rate) => sum + rate, BigInt(0)), minimum };
}

export function calculateServiceTotalSatang(service: { pricing_model: "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME"; unit_price: string | number; quantity: number }, nights: number) {
  if (!Number.isSafeInteger(service.quantity) || service.quantity < 1 || !Number.isSafeInteger(nights) || nights < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Service quantity and stay length must be positive integers." });
  const unitPrice = moneyToSatang(String(service.unit_price));
  if (unitPrice < BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Service price cannot be negative." });
  const multiplier = BigInt(service.quantity) * (service.pricing_model === "ONE_TIME" ? BigInt(1) : BigInt(nights));
  return unitPrice * multiplier;
}

export function roundAverageNightlySatang(total: bigint, nights: number) {
  if (nights <= 0) throw new RangeError("Stay must contain at least one night.");
  const roundedBaht = positiveBigintRound(total, BigInt(nights * 100));
  return roundedBaht * BigInt(100);
}
