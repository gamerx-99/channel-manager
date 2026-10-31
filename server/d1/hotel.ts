import { createHotelOwnerMembership } from "./signupLinks";
import { getSupportMemberships } from "./supportAccess";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { defaultChildRateConfig, defaultOccupancyPricing } from "@shared/occupancyPricing";
import type { AppRole } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { bookings, hotelMedia, hotelServices, hotelUsers, hotels, roomTypes, rooms } from "../../drizzle/d1-schema";
import { authorizeHotelAction, authorizePlatformAction, requirePublicHotel, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { moneyToSatang, satangToMoney } from "../db/money";
import type { CreateHotelInput, CreateHotelServiceInput, CreateRoomTypeInput, DeleteRoomTypeInput, DeleteHotelServiceInput, HotelRecord, RoomTypeRecord, UpdateHotelServiceInput, UpdateRoomTypeInput } from "../db/types";

function canonicalMoney(value: string | number): string {
  const satang = moneyToSatang(String(value));
  if (satang < BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Money cannot be negative." });
  return satangToMoney(satang);
}

function canonicalThreshold(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Child height limit must be a nonnegative finite number." });
  if (numeric === 0) return "0";
  const raw = String(numeric);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponentText] = raw.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const [whole, fraction = ""] = mantissa!.split(".");
  const digits = whole! + fraction;
  const decimalIndex = whole!.length + exponent;
  if (decimalIndex <= 0) return `0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export async function listManagedHotels(db: D1ScopedDatabase, caller: D1CallerContext) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "FORBIDDEN" });
  const memberships = await db.select({ hotelId: hotelUsers.hotelId, role: hotelUsers.role }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  const supportMemberships = await getSupportMemberships(db, caller);
  const safeMemberships = caller.roles?.includes("support") || memberships.some(m => m.role === "support")
    ? supportMemberships
    : memberships.filter(m => !["support", "admin", "super_admin"].includes(m.role));
  const output = [];
  for (const { hotelId } of safeMemberships) {
    const scope = await authorizeHotelAction(db, caller, hotelId, "property.view", "hotels.list", new Date());
    const [hotel] = await db.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    if (!hotel) continue;
    const canViewFinancials = scope.permissions.includes("property.view_financials");
    const [hotelRoomTypes, hotelRooms, hotelBookings] = await Promise.all([
      db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.hotelId, hotelId)),
      db.select({ id: rooms.id, status: rooms.status }).from(rooms).where(eq(rooms.hotelId, hotelId)),
      scope.permissions.includes("operations.view_bookings") ? db.select({ id: bookings.id, source: bookings.source, status: bookings.status, check_in: bookings.checkIn, check_out: bookings.checkOut, price: bookings.price })
        .from(bookings).where(eq(bookings.hotelId, hotelId)) : Promise.resolve([]),
    ]);
    output.push({
      id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address,
      public_enabled: hotel.publicEnabled, created_at: hotel.createdAt,
      room_types: hotelRoomTypes, rooms: hotelRooms,
      bookings: hotelBookings.map(b => ({ ...b, price: canViewFinancials ? b.price : null })) as any,
    });
  }
  return output.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

export async function listManagedHotelsForFinancials(db: D1ScopedDatabase, caller: D1CallerContext) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "FORBIDDEN" });
  const allMemberships = await db.select({
    hotelId: hotelUsers.hotelId, role: hotelUsers.role, grants: hotelUsers.permissionGrants, revokes: hotelUsers.permissionRevokes,
  }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  const blocked = (role: string) => role === "support" || role === "super_admin";
  if (caller.roles?.some(blocked) || allMemberships.some(row => blocked(row.role))) throw new TRPCError({ code: "FORBIDDEN" });
  // Hotels are chosen by the owner's per-person switch, never by another hotel's membership.
  const memberships = allMemberships.filter(row => resolveMembershipPermissions(row.role as AppRole, { grants: row.grants, revokes: row.revokes }).includes("property.view_financials"));
  const output = [];
  for (const membership of memberships) {
    await authorizeHotelAction(db, caller, membership.hotelId, "property.view_financials", "financials.list_hotels", new Date());
    const rows = await db.select({
      id: bookings.id, status: bookings.status, payment_status: bookings.paymentStatus, check_in: bookings.checkIn, check_out: bookings.checkOut,
      price: bookings.price, roomTypeName: roomTypes.name,
    }).from(bookings).leftJoin(rooms, eq(bookings.roomId, rooms.id)).leftJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
      .where(eq(bookings.hotelId, membership.hotelId)).orderBy(desc(bookings.checkIn));
    output.push({ id: membership.hotelId, bookings: rows.map(({ roomTypeName, ...booking }) => ({ ...booking, rooms: { room_types: roomTypeName ? { name: roomTypeName } : null } })) });
  }
  return output;
}

export async function getManagedHotel(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "hotel.read", now);
  const [hotel] = await db.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel) return null;
  const [hotelRoomTypes, hotelRooms] = await Promise.all([
    db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotelId)),
    db.select().from(rooms).where(eq(rooms.hotelId, hotelId)),
  ]);
  return {
    id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address,
    public_enabled: hotel.publicEnabled, created_at: hotel.createdAt,
    room_types: hotelRoomTypes.map(row => ({
      id: row.id, hotel_id: row.hotelId, name: row.name, capacity: row.capacity, base_price: row.basePrice,
      base_occupancy: row.baseOccupancy, max_occupancy: row.maxOccupancy, occupancy_pricing: row.occupancyPricing,
      child_rule: row.childRule, child_rule_limit: row.childRuleLimit, child_rates: row.childRates,
      children_count_toward_max: row.childrenCountTowardMax,
    })),
    rooms: hotelRooms.map(row => ({ id: row.id, room_type_id: row.roomTypeId, room_number: row.roomNumber, status: row.status })),
  };
}

export async function createManagedHotel(db: D1ScopedDatabase, caller: D1CallerContext, input: CreateHotelInput) {
  await authorizePlatformAction(db, caller, "platform.manage_hotels");
  const [hotel] = await db.insert(hotels).values({
    name: input.name, slug: input.slug, address: input.address, ownerContact: input.owner_contact,
    publicEnabled: input.public_enabled,
  }).returning();
  if (!hotel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel insert did not return a record." });
  return { id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address, public_enabled: hotel.publicEnabled, created_at: hotel.createdAt };
}

/** Publish the hotel page at /:slug and open direct booking, or take it private again. */
export async function setHotelPublicEnabled(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, enabled: boolean, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel.public_enabled.update", now);
  const [hotel] = await db.update(hotels).set({ publicEnabled: enabled }).where(eq(hotels.id, hotelId))
    .returning({ id: hotels.id, publicEnabled: hotels.publicEnabled });
  if (!hotel) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found." });
  return { id: hotel.id, public_enabled: hotel.publicEnabled };
}

// A hotel page lives at /:slug, so a slug must not shadow an app route.
const RESERVED_HOTEL_SLUGS = new Set([
  "accept-invite", "api", "assets", "communications", "dashboard", "hotels", "housekeeping", "login", "media", "mfa",
  "platform", "settings", "signup", "website-builder",
]);

/**
 * Public signup: a signed-in account with no role yet becomes the owner of one new hotel.
 * ASSUMPTION: one hotel per account, and the hotel stays private until the owner publishes it.
 */
export async function registerOwnHotel(db: D1ScopedDatabase, caller: D1CallerContext, input: Omit<CreateHotelInput, "public_enabled">, now = new Date()) {
  if (!caller.userId || caller.access === "public" || caller.roles?.some(role => role === "super_admin" || role === "admin" || role === "support")) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (RESERVED_HOTEL_SLUGS.has(input.slug)) throw new TRPCError({ code: "BAD_REQUEST", message: "This web address is reserved." });
  const memberships = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId)).limit(1);
  if (memberships.length) throw new TRPCError({ code: "CONFLICT", message: "This account already has a hotel." });
  const taken = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.slug, input.slug)).limit(1);
  if (taken.length) throw new TRPCError({ code: "CONFLICT", message: "This web address is already in use." });

  const [hotel] = await db.insert(hotels).values({
    name: input.name, slug: input.slug, address: input.address, ownerContact: input.owner_contact, publicEnabled: false,
  }).returning();
  if (!hotel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel insert did not return a record." });
  try {
    await createHotelOwnerMembership(db, hotel.id, caller.userId, now);
  } catch (error) {
    await db.delete(hotels).where(eq(hotels.id, hotel.id));
    throw error;
  }
  return { id: hotel.id, name: hotel.name, slug: hotel.slug };
}

export async function createManagedRoomType(db: D1ScopedDatabase, caller: D1CallerContext, input: CreateRoomTypeInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "room_types.create", now);
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Room quantity must be a positive integer." });
  const baseOccupancy = input.base_occupancy ?? Math.min(2, input.capacity);
  const maxOccupancy = input.max_occupancy ?? input.capacity;
  const occupancyPricing = input.occupancy_pricing ?? defaultOccupancyPricing(baseOccupancy, maxOccupancy);
  const childRule = input.child_rule ?? "age";
  const childRates = input.child_rates ?? defaultChildRateConfig();
  const childRuleLimit = input.child_rule_limit ?? null;
  if (childRule === "height" && childRuleLimit == null) throw new TRPCError({ code: "BAD_REQUEST", message: "A child height limit is required." });
  const basePrice = canonicalMoney(input.base_price);
  const roomTypeId = crypto.randomUUID();
  const existingRooms = await db.select({ roomNumber: rooms.roomNumber }).from(rooms).where(eq(rooms.hotelId, input.hotel_id));
  const startNumber = existingRooms.reduce((max, row) => Math.max(max, Number(row.roomNumber) || 0), 0) + 1;
  const batch = [db.$client.prepare(`insert into room_types
    (id, hotel_id, name, capacity, base_price, base_occupancy, max_occupancy, occupancy_pricing, child_rule, child_rule_limit, child_rates, children_count_toward_max)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(roomTypeId, input.hotel_id, input.name, maxOccupancy, basePrice, baseOccupancy, maxOccupancy,
      JSON.stringify(occupancyPricing), childRule, childRuleLimit == null ? null : canonicalThreshold(childRuleLimit), JSON.stringify(childRates), (input.children_count_toward_max ?? true) ? 1 : 0)];
  for (let index = 0; index < input.quantity; index++) {
    batch.push(db.$client.prepare("insert into rooms (id, hotel_id, room_type_id, room_number) values (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), input.hotel_id, roomTypeId, String(startNumber + index).padStart(3, "0")));
  }
  await db.$client.batch(batch);
  const [row] = await db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId)).limit(1);
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Room type creation returned no record." });
  return row;
}

export async function updateManagedRoomType(db: D1ScopedDatabase, caller: D1CallerContext, input: UpdateRoomTypeInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "room_types.update", now);
  const patch: Partial<typeof roomTypes.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.base_price !== undefined) patch.basePrice = canonicalMoney(input.base_price);
  if (input.max_occupancy !== undefined || input.capacity !== undefined) {
    patch.capacity = input.max_occupancy ?? input.capacity;
    patch.maxOccupancy = input.max_occupancy ?? input.capacity;
  }
  if (input.base_occupancy !== undefined) patch.baseOccupancy = input.base_occupancy;
  if (input.occupancy_pricing !== undefined) patch.occupancyPricing = input.occupancy_pricing;
  if (input.child_rule !== undefined) patch.childRule = input.child_rule;
  if (input.child_rule_limit !== undefined) patch.childRuleLimit = input.child_rule_limit == null ? null : canonicalThreshold(input.child_rule_limit);
  if (input.child_rates !== undefined) patch.childRates = input.child_rates;
  if (input.children_count_toward_max !== undefined) patch.childrenCountTowardMax = input.children_count_toward_max;
  const [row] = await db.update(roomTypes).set(patch).where(and(
    eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, input.hotel_id),
  )).returning();
  return row ?? null;
}

export async function deleteManagedRoomType(db: D1ScopedDatabase, caller: D1CallerContext, input: DeleteRoomTypeInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "room_types.delete", now);
  const [row] = await db.delete(roomTypes).where(and(
    eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, input.hotel_id),
  )).returning({ id: roomTypes.id });
  return row ?? null;
}

export async function createHotelService(db: D1ScopedDatabase, caller: D1CallerContext, input: CreateHotelServiceInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "hotel_services.create", now);
  const [row] = await db.insert(hotelServices).values({
    hotelId: input.hotel_id, name: input.name, pricingModel: input.pricing_model, unitPrice: canonicalMoney(input.unit_price),
  }).returning();
  return row;
}

export async function updateHotelService(db: D1ScopedDatabase, caller: D1CallerContext, input: UpdateHotelServiceInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "hotel_services.update", now);
  const [row] = await db.update(hotelServices).set({
    name: input.name, pricingModel: input.pricing_model, unitPrice: canonicalMoney(input.unit_price), isActive: input.is_active,
  }).where(and(eq(hotelServices.id, input.service_id), eq(hotelServices.hotelId, input.hotel_id))).returning();
  return row ?? null;
}

export async function deleteHotelService(db: D1ScopedDatabase, caller: D1CallerContext, input: DeleteHotelServiceInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_room_structure", "hotel_services.delete", now);
  const [row] = await db.delete(hotelServices).where(and(eq(hotelServices.id, input.service_id), eq(hotelServices.hotelId, input.hotel_id)))
    .returning({ id: hotelServices.id });
  return row ?? null;
}

export async function listHotelServices(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_room_structure", "hotel_services.list", now);
  return db.select().from(hotelServices).where(eq(hotelServices.hotelId, hotelId)).orderBy(asc(hotelServices.createdAt));
}

export async function listActiveHotelServicesBySlug(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  const hotel = await requirePublicHotel(db, caller, slug);
  return db.select().from(hotelServices).where(and(eq(hotelServices.hotelId, hotel.id), eq(hotelServices.isActive, true)))
    .orderBy(asc(hotelServices.createdAt));
}

export async function getPublicHotel(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  const hotel = await requirePublicHotel(db, caller, slug);
  const [hotelRoomTypes, media] = await Promise.all([
    db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotel.id)),
    db.select({ id: hotelMedia.id, url: hotelMedia.url, caption: hotelMedia.caption, is_hero: hotelMedia.isHero, display_order: hotelMedia.displayOrder })
      .from(hotelMedia).where(eq(hotelMedia.hotelId, hotel.id)).orderBy(asc(hotelMedia.displayOrder)),
  ]);
  hotelRoomTypes.sort((left, right) => {
    const leftPrice = moneyToSatang(left.basePrice);
    const rightPrice = moneyToSatang(right.basePrice);
    const priceOrder = leftPrice === rightPrice ? 0 : leftPrice < rightPrice ? -1 : 1;
    return priceOrder || left.id.localeCompare(right.id);
  });
  return {
    hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address, created_at: hotel.createdAt },
    roomTypes: hotelRoomTypes,
    media,
  };
}
