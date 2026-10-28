import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, bookingServices, bookingStatusLog, d1Schema, guests, hotelUsers, hotels, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { cancelHotelBooking } from "../db/scope";
import { getStayDates, createBookingWithGuests, createPublicBooking, confirmBookingDetails, expireBookingIfPast, getPublicHotelAvailability, holdRoomType, listBookingsForHotel, logBookingStatusChange } from "./booking";
import * as bookingRepository from "./booking";
import { transitionBookingStatus, updateRoomTypeWithOccupancyConfig, calculateNightPriceSatang, calculateServiceTotalSatang, priceStayForRoomType } from "./bookingService";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = {
    prepare: query => ({ bind: (...params) => ({ query, params }) }),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => {
          const { query, params } = statement as { query: string; params: unknown[] };
          return { meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
});
afterEach(() => sqlite.close());

const publicCaller = { userId: "", access: "public" as const };
const ownerA = { userId: "owner-a" };
const bookingInput = (hotelId: string, roomId: string | null, status: "confirmed" | "held" = "confirmed", checkIn = "2026-11-01", checkOut = "2026-11-02") => ({
  hotel_id: hotelId, room_id: roomId, guest_name: "Test Guest", check_in: checkIn, check_out: checkOut,
  price: "100.00", source: "manual" as const, status, payment_status: "unpaid" as const, created_at: "2026-10-01T00:00:00.000Z",
  rooms: null, guests: [], adults_count: 2,
});

async function seedHotel(id: string, owner: string, options: { published?: boolean; quantity?: number } = {}) {
  await db.insert(hotels).values({ id, name: `Hotel ${id}`, slug: `${id}-slug`, address: "Address", ownerContact: `${owner}@example.test`, publicEnabled: options.published ?? true });
  await db.insert(hotelUsers).values({ id: `membership-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: `type-${id}`, hotelId: id, name: "Standard", capacity: 2, basePrice: "100.00", baseOccupancy: 2, maxOccupancy: 2, occupancyPricing: { "1": { enabled: false, mode: "percent", value: -10 }, "2": { enabled: true, mode: "percent", value: 0 } }, childRates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } } });
  for (let i = 1; i <= (options.quantity ?? 1); i++) await db.insert(rooms).values({ id: `room-${id}-${i}`, hotelId: id, roomTypeId: `type-${id}`, roomNumber: String(i).padStart(3, "0") });
}

const guest = { first_name: "Test", middle_name: null, last_name: "Person", gender: null as const, passport_no: "TEST-123", nationality_code: "THA", birth_date: "1990-01-01", phone_no: null };

describe("D1 booking repositories", () => {
  it("preserves every source booking export", () => {
    expect(Object.keys(bookingRepository).sort()).toEqual([
      "confirmBookingDetails", "createBookingWithGuests", "createPublicBooking", "expireBookingIfPast",
      "getPublicHotelAvailability", "getStayDates", "holdRoomType", "listBookingsForHotel",
      "logBookingStatusChange", "transitionBookingStatus",
    ].sort());
  });

  it("keeps getStayDates pure, excludes checkout, and crosses month boundaries", () => {
    expect(getStayDates("2026-01-31", "2026-02-02")).toEqual(["2026-01-31", "2026-02-01"]);
    expect(getStayDates("2026-02-02", "2026-02-02")).toEqual([]);
    expect(getStayDates("invalid", "2026-02-02")).toEqual([]);
  });

  it("calculates all prices exactly in satang, including occupancy, child and service rules", async () => {
    const rules = {
      base_occupancy: 2, max_occupancy: 4, child_rule: "age" as const, child_rule_limit: null, children_count_toward_max: true,
      occupancy_pricing: { "1": { enabled: false, mode: "percent" as const, value: -10 }, "2": { enabled: true, mode: "percent" as const, value: 0 }, "3": { enabled: true, mode: "percent" as const, value: 15 }, "4": { enabled: true, mode: "fixed" as const, value: 250 } },
      child_rates: { infant: { mode: "fixed" as const, value: "25.25" }, age_groups: [{ min_age: 3, max_age: 12, mode: "percent" as const, value: 10 }], height: { mode: "free" as const, value: 0 } },
    };
    const counts = { infant: 0, age_groups: [0], height: 0 };
    expect(calculateNightPriceSatang({ nightlyRate: 10000n, rules, totalGuestCount: 3, childRateCounts: counts })).toBe(11500n);
    expect(calculateNightPriceSatang({ nightlyRate: 10000n, rules, totalGuestCount: 4, childRateCounts: counts })).toBe(35000n);
    expect(calculateNightPriceSatang({ nightlyRate: 10000n, rules, totalGuestCount: 2, childRateCounts: { infant: 1, age_groups: [1], height: 0 } })).toBe(13525n);
    expect(calculateServiceTotalSatang({ pricing_model: "PER_PERSON_PER_NIGHT", unit_price: "10.05", quantity: 2 }, 3)).toBe(6030n);
    await seedHotel("a", "owner-a");
    await db.insert(rateOverrides).values({ id: "override-a", roomTypeId: "type-a", startDate: "2026-11-02", endDate: "2026-11-02", overridePrice: "125.50", minStayNights: 1, createdAt: new Date("2026-01-01T00:00:00Z") });
    const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, "type-a"));
    const priced = await priceStayForRoomType(db, type!, "2026-11-01", "2026-11-03", 2, []);
    expect(priced.pricing.nightlyPrices).toEqual([10000n, 12550n]);
    expect(priced.pricing.totalPrice).toBe(22550n);
  });

  it("denies public context misuse and cross-hotel repository access", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b", { published: false });
    await expect(listBookingsForHotel(db, ownerA, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(logBookingStatusChange(db, ownerA, { booking_id: "missing", hotel_id: "b", from_status: null, to_status: "confirmed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createBookingWithGuests(db, ownerA, bookingInput("b", "room-b-1"), [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPublicHotelAvailability(db, ownerA, "a-slug", "2026-11-01", "2026-11-02")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPublicHotelAvailability(db, publicCaller, "b-slug", "2026-11-01", "2026-11-02")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(expireBookingIfPast(db, ownerA, "missing", "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serializes last-room booking attempts and never leaves partial records", async () => {
    await seedHotel("a", "owner-a");
    const attempts = await Promise.allSettled([
      createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "One Guest", guest_phone: "111", guest_email: null, check_in: "2026-11-01", check_out: "2026-11-02" }),
      createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "Two Guest", guest_phone: "222", guest_email: null, check_in: "2026-11-01", check_out: "2026-11-02" }),
    ]);
    expect(attempts.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(item => item.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(guests)).toHaveLength(1);
    expect(await db.select().from(bookingStatusLog)).toHaveLength(1);
  });

  it("rolls back booking, guests and audit together when a related insert fails", async () => {
    await seedHotel("a", "owner-a");
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1"), [{ ...guest, nationality_code: "US" }])).rejects.toThrow();
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(guests)).toHaveLength(0);
    expect(await db.select().from(bookingStatusLog)).toHaveLength(0);
  });

  it("allows adjacent stays and cancellation frees inventory with an audit", async () => {
    await seedHotel("a", "owner-a");
    await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1"), []);
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-02", "2026-11-03"), [])).resolves.toMatchObject({ check_in: "2026-11-02" });
    const cancellationId = "cancel-me";
    await db.insert(bookings).values({ id: cancellationId, hotelId: "a", roomId: "room-a-1", guestName: "Cancel", checkIn: "2026-11-05", checkOut: "2026-11-06", price: "100.00", source: "manual", status: "confirmed" });
    await expect(cancelHotelBooking(db, ownerA, "a", cancellationId, new Date(), "Guest request")).resolves.toEqual({ id: cancellationId });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, cancellationId)))[0]?.reason).toBe("Guest request");
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-05", "2026-11-06"), [])).resolves.toMatchObject({ check_in: "2026-11-05" });
  });

  it("expires stale holds atomically; active holds block and expired holds release the room", async () => {
    await seedHotel("a", "owner-a");
    const now = new Date("2026-10-28T00:00:00Z");
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-02", adults: 2, children: [] }, now);
    await expect(createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "Blocked Guest", check_in: "2026-11-01", check_out: "2026-11-02" }, now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(expireBookingIfPast(db, publicCaller, hold.booking_id, "a", new Date(now.getTime() + 16 * 60_000))).resolves.toMatchObject({ status: "expired" });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, hold.booking_id))).map(row => row.toStatus)).toEqual(["held", "expired"]);
    await expect(createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "Available Guest", check_in: "2026-11-01", check_out: "2026-11-02" }, now)).resolves.toMatchObject({ success: true });
  });

  it("confirms a hold with exact add-on totals and a same-batch status audit", async () => {
    await seedHotel("a", "owner-a");
    const now = new Date("2026-10-28T00:00:00Z");
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-03", adults: 2, children: [] }, now);
    await expect(confirmBookingDetails(db, publicCaller, { booking_id: hold.booking_id, hotel_id: "a", guest_name: "Confirmed Guest", services: [{ service_name: "Breakfast", pricing_model: "PER_PERSON_PER_NIGHT", unit_price: "10.25", quantity: 2 }, { service_name: "Transfer", pricing_model: "ONE_TIME", unit_price: "25.50", quantity: 1 }] }, now)).resolves.toMatchObject({ amount: "266.50" });
    expect((await db.select().from(bookings).where(eq(bookings.id, hold.booking_id)))[0]?.price).toBe("266.50");
    expect(await db.select().from(bookingServices).where(eq(bookingServices.bookingId, hold.booking_id))).toHaveLength(2);
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, hold.booking_id))).at(-1)?.toStatus).toBe("pending_payment");
  });

  it("transitions check-in/out with scoped audit and denies cross-hotel ids", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(bookings).values({ id: "confirmed-a", hotelId: "a", roomId: "room-a-1", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
    await db.insert(bookings).values({ id: "confirmed-b", hotelId: "b", roomId: "room-b-1", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-b", hotel_id: "b", to_status: "checked_in" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-a", hotel_id: "a", to_status: "checked_in" })).resolves.toMatchObject({ from_status: "confirmed" });
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-a", hotel_id: "a", to_status: "checked_out" })).resolves.toMatchObject({ from_status: "checked_in" });
    expect(await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, "confirmed-a"))).toHaveLength(2);
  });

  it("redacts booking price and guest PII from a view-only role", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(hotelUsers).values({ id: "frontdesk-a", hotelId: "a", userId: "frontdesk-a", role: "front_desk", permissionGrants: [], permissionRevokes: ["operations.manage_guests"] });
    await db.insert(bookings).values({ id: "booking-a", hotelId: "a", roomId: "room-a-1", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
    await db.insert(guests).values({ id: "guest-a", bookingId: "booking-a", firstName: guest.first_name, middleName: guest.middle_name, lastName: guest.last_name, gender: guest.gender, passportNo: guest.passport_no, nationalityCode: guest.nationality_code, birthDate: guest.birth_date, phoneNo: guest.phone_no });
    const result = await listBookingsForHotel(db, { userId: "frontdesk-a" }, "a");
    expect(result[0]).toMatchObject({ price: null, guests: [] });
  });

  it("updates occupancy config only inside scope and preserves child-rule switch behavior", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(roomTypes).values({ id: "type-a-sibling", hotelId: "a", name: "Other", capacity: 2, basePrice: "120.00", childRule: "age", childRuleLimit: "10", baseOccupancy: 2, maxOccupancy: 2, occupancyPricing: { "2": { enabled: true, mode: "percent", value: 0 } } });
    await expect(updateRoomTypeWithOccupancyConfig(db, ownerA, { hotel_id: "b", room_type_id: "type-b", name: "No", capacity: 2, base_price: "100", occupancy_config: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateRoomTypeWithOccupancyConfig(db, ownerA, { hotel_id: "a", room_type_id: "type-a", name: "Updated", capacity: 2, base_price: "101.25", occupancy_config: { child_rule: "height", child_rule_limit: "1.601234567890123456789e2" } })).resolves.toMatchObject({ childRule: "height", childRuleLimit: "160.1234567890123456789" });
    const [sibling] = await db.select().from(roomTypes).where(eq(roomTypes.id, "type-a-sibling"));
    expect(sibling?.childRule).toBe("age"); expect(sibling?.childRuleLimit).toBe("10");
  });
});
