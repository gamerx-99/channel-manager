import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookingNights, bookings, bookingServices, bookingStatusLog, d1Schema, guests, hotelServices, hotelUsers, hotels, otaConnections, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { cancelHotelBooking, createD1SystemCallerContext } from "../db/scope";
import { getStayDates, createBookingWithGuests, createPublicBooking, confirmBookingDetails, expireBookingIfPast, getPublicHotelAvailability, holdRoomType, listBookingsForHotel, logBookingStatusChange } from "./booking";
import * as bookingRepository from "./booking";
import { transitionBookingStatus, updateRoomTypeWithOccupancyConfig, calculateNightPriceSatang, calculateServiceTotalSatang, priceStayForRoomType } from "./bookingService";
import { addNightsStatement } from "./bookingNights";
import { syncOtaIcalBlocks } from "./ota";

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

async function assertBookingNightsInvariant(now: Date) {
  const rows = await db.select({ id: bookings.id, roomId: bookings.roomId, checkIn: bookings.checkIn, checkOut: bookings.checkOut, status: bookings.status, expiresAt: bookings.expiresAt }).from(bookings);
  const expected = rows.flatMap(row => {
    const held = ["held", "pending_payment", "pending_verification"].includes(row.status);
    const occupies = row.status === "confirmed" || row.status === "checked_in" || (held && (row.expiresAt === null || row.expiresAt.getTime() >= now.getTime()));
    return row.roomId && occupies ? getStayDates(row.checkIn, row.checkOut).map(night => `${row.roomId}|${night}|${row.id}`) : [];
  }).sort();
  const actual = (await db.select().from(bookingNights)).map(row => `${row.roomId}|${row.night}|${row.bookingId}`).sort();
  expect(actual).toEqual(expected);
}

describe("D1 booking repositories", () => {
  it("preserves every source booking export", () => {
    expect(Object.keys(bookingRepository).sort()).toEqual([
      "claimBookingNights", "confirmBookingDetails", "countActiveHoldsForIp", "createBookingWithGuests", "createPublicBooking", "expireBookingIfPast",
      "getPublicHotelAvailability", "getStayDates", "holdRoomType", "listBookingsForHotel",
      "logBookingStatusChange", "transitionBookingStatus",
    ].sort());
  });

  it("keeps getStayDates pure, excludes checkout, and crosses month boundaries", () => {
    expect(getStayDates("2026-01-31", "2026-02-02")).toEqual(["2026-01-31", "2026-02-01"]);
    expect(getStayDates("2026-02-02", "2026-02-02")).toEqual([]);
    expect(getStayDates("invalid", "2026-02-02")).toEqual([]);
  });

  it("enforces the unique room-night key and blocks an overlapping raw insert without the old guard", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(bookings).values([
      { id: "night-owner", hotelId: "a", roomId: "room-a-1", guestName: "A", checkIn: "2026-11-01", checkOut: "2026-11-03", price: "100.00", source: "manual", status: "confirmed" },
      { id: "night-contender", hotelId: "a", roomId: "room-a-1", guestName: "B", checkIn: "2026-11-01", checkOut: "2026-11-03", price: "100.00", source: "manual", status: "confirmed" },
    ]);
    await db.insert(bookingNights).values({ roomId: "room-a-1", night: "2026-11-01", bookingId: "night-owner" });
    await expect(db.insert(bookingNights).values({ roomId: "room-a-1", night: "2026-11-01", bookingId: "night-contender" }))
      .rejects.toThrow(/Failed query: insert into "booking_nights"/);

    await expect(db.$client.batch([
      db.$client.prepare(`INSERT INTO bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
        VALUES ('raw-contender', 'a', 'room-a-1', 'Raw', '2026-11-01', '2026-11-03', '100.00', 'manual', 'confirmed')`).bind(),
      addNightsStatement(db, "raw-contender", getStayDates("2026-11-01", "2026-11-03"), new Date("2026-10-28T00:00:00Z")),
    ])).rejects.toThrow(/UNIQUE constraint failed: booking_nights/);
    expect(await db.select().from(bookings)).toHaveLength(2);
    expect((await db.select().from(bookings)).some(row => row.id === "raw-contender")).toBe(false);
  });

  it("creates one row per occupied night and creates none for roomless or non-occupying bookings", async () => {
    await seedHotel("a", "owner-a", { quantity: 2 });
    const active = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-01", "2026-11-04"), []);
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, active.id))).map(row => row.night).sort())
      .toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    const checkedOut = await createBookingWithGuests(db, ownerA, { ...bookingInput("a", "room-a-2", "confirmed", "2026-11-01", "2026-11-04"), status: "checked_out" }, []);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, checkedOut.id))).toEqual([]);
    const noRoom = await createBookingWithGuests(db, ownerA, bookingInput("a", null, "confirmed", "2026-11-01", "2026-11-04"), []);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, noRoom.id))).toEqual([]);
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
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, cancellationId))).toEqual([]);
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, cancellationId)))[0]?.reason).toBe("Guest request");
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-05", "2026-11-06"), [])).resolves.toMatchObject({ check_in: "2026-11-05" });
  });

  it("rejects a booking status outside the Supabase lifecycle CHECK values", async () => {
    await seedHotel("a", "owner-a");
    await expect(createBookingWithGuests(db, ownerA, { ...bookingInput("a", "room-a-1"), status: "not_a_booking_status" } as any, [])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it("expires stale holds atomically; active holds block and expired holds release the room", async () => {
    await seedHotel("a", "owner-a");
    const now = new Date("2026-10-28T00:00:00Z");
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-02", adults: 2, children: [] }, now);
    await expect(createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "Blocked Guest", check_in: "2026-11-01", check_out: "2026-11-02" }, now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(expireBookingIfPast(db, publicCaller, hold.booking_id, "a", new Date(now.getTime() + 16 * 60_000))).resolves.toMatchObject({ status: "expired" });
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, hold.booking_id))).toEqual([]);
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, hold.booking_id))).map(row => row.toStatus)).toEqual(["held", "expired"]);
    await expect(createPublicBooking(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", guest_name: "Available Guest", check_in: "2026-11-01", check_out: "2026-11-02" }, now)).resolves.toMatchObject({ success: true });
  });

  it("cleans an expired-but-still-held row before a new hold without waiting for lazy expiry", async () => {
    await seedHotel("a", "owner-a");
    const now = new Date("2026-10-28T00:00:00Z");
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-03", adults: 2, children: [] }, now);
    const later = new Date(now.getTime() + 16 * 60_000);
    const replacement = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-03", adults: 2, children: [] }, later);
    expect((await db.select().from(bookings).where(eq(bookings.id, hold.booking_id)))[0]?.status).toBe("held");
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, hold.booking_id))).toEqual([]);
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, replacement.booking_id))).map(row => row.night).sort())
      .toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("rolls back the booking and dependent rows when booking_nights rejects the write", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(bookings).values({ id: "cancelled-owner", hotelId: "a", roomId: "room-a-1", guestName: "Old", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "cancelled" });
    await db.insert(bookingNights).values({ roomId: "room-a-1", night: "2026-11-01", bookingId: "cancelled-owner" });
    const error = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1"), [guest], [{ service_name: "Breakfast", pricing_model: "ONE_TIME", unit_price: "10.00", quantity: 1, total_price: "10.00" }])
      .then(() => null, caught => caught);
    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect(error.message).not.toMatch(/UNIQUE constraint failed/);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(guests)).toEqual([]);
    expect(await db.select().from(bookingServices)).toEqual([]);
    expect(await db.select().from(bookingStatusLog)).toEqual([]);
  });

  it("keeps booking_nights equal to the occupancy invariant through a seeded 40-operation sequence", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(otaConnections).values({ id: "ota-a", hotelId: "a", provider: "Trip", status: "connected", roomId: "room-a-1", icalExportToken: "a".repeat(64) });
    let now = new Date("2026-10-28T05:00:00Z");
    let operations = 0;
    const verify = async () => { operations += 1; await assertBookingNightsInvariant(now); };
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const day = (offset: number) => new Date(Date.UTC(2026, 10, 1 + cycle * 4 + offset)).toISOString().slice(0, 10);
      const occupied = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", day(0), day(1)), [] , [], now);
      await verify();
      await transitionBookingStatus(db, ownerA, { booking_id: occupied.id, hotel_id: "a", to_status: "checked_in" }, now);
      await verify();
      await transitionBookingStatus(db, ownerA, { booking_id: occupied.id, hotel_id: "a", to_status: "checked_out" }, now);
      await verify();

      const cancelled = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", day(1), day(2)), [], [], now);
      await verify();
      await cancelHotelBooking(db, ownerA, "a", cancelled.id, now, "sequence cancellation");
      await verify();

      const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: day(2), check_out: day(3), adults: 2, children: [] }, now);
      await verify();
      now = new Date(now.getTime() + 16 * 60_000);
      await expireBookingIfPast(db, publicCaller, hold.booking_id, "a", now);
      await verify();

      const start = new Date(Date.UTC(2026, 10, 17 + cycle * 3)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(2026, 10, 19 + cycle * 3)).toISOString().slice(0, 10);
      const event = { uid: `sequence-${cycle}`, start, end };
      await syncOtaIcalBlocks(db, createD1SystemCallerContext(), "ota-a", [event], {}, now);
      await verify();
      const moved = { ...event, start: new Date(Date.parse(`${start}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), end: new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) };
      await syncOtaIcalBlocks(db, createD1SystemCallerContext(), "ota-a", [moved], {}, now);
      await verify();

      // OTA update-conflict case: attempting to move the existing OTA booking to dates blocked by another confirmed booking
      const conflictBlocker = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", day(3), day(4)), [], [], now);
      await verify();
      const conflictAttempt = { ...event, start: day(3), end: day(4) };
      const conflictOutcome = await syncOtaIcalBlocks(db, createD1SystemCallerContext(), "ota-a", [conflictAttempt], {}, now);
      expect(conflictOutcome.conflicts).toEqual([{ uid: conflictAttempt.uid, start: day(3), end: day(4) }]);
      // Invariant holds: the existing OTA booking retained its nights from moved
      await verify();
      await cancelHotelBooking(db, ownerA, "a", conflictBlocker.id, now, "conflict blocker removal");
      await verify();

      await syncOtaIcalBlocks(db, createD1SystemCallerContext(), "ota-a", [], {}, now);
      await verify();
    }
    expect(operations).toBeGreaterThanOrEqual(30);
  });

  it("confirms a hold with exact add-on totals and a same-batch status audit", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(hotelServices).values([
      { id: "breakfast-a", hotelId: "a", name: "Breakfast", pricingModel: "PER_PERSON_PER_NIGHT", unitPrice: "10.25", isActive: true },
      { id: "transfer-a", hotelId: "a", name: "Transfer", pricingModel: "ONE_TIME", unitPrice: "25.50", isActive: true },
    ]);
    const now = new Date("2026-10-28T00:00:00Z");
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-03", adults: 2, children: [] }, now);
    await expect(confirmBookingDetails(db, publicCaller, { booking_id: hold.booking_id, hotel_id: "a", guest_name: "Confirmed Guest", services: [
      { hotel_service_id: "breakfast-a", quantity: 2, unit_price: "0", service_name: "Free Breakfast", pricing_model: "ONE_TIME" },
      { hotel_service_id: "transfer-a", quantity: 1 },
    ] as any }, now)).resolves.toMatchObject({ amount: "266.50" });
    expect((await db.select().from(bookings).where(eq(bookings.id, hold.booking_id)))[0]?.price).toBe("266.50");
    expect(await db.select().from(bookingServices).where(eq(bookingServices.bookingId, hold.booking_id))).toMatchObject([
      { serviceName: "Breakfast", pricingModel: "PER_PERSON_PER_NIGHT", unitPrice: "10.25", totalPrice: "41.00" },
      { serviceName: "Transfer", pricingModel: "ONE_TIME", unitPrice: "25.50", totalPrice: "25.50" },
    ]);
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, hold.booking_id))).at(-1)?.toStatus).toBe("pending_payment");
  });

  it("rejects add-on service IDs belonging to another hotel", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(hotelServices).values({ id: "service-b", hotelId: "b", name: "Other hotel", pricingModel: "ONE_TIME", unitPrice: "1.00", isActive: true });
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-02", adults: 2, children: [] });
    await expect(confirmBookingDetails(db, publicCaller, { booking_id: hold.booking_id, hotel_id: "a", guest_name: "Guest", services: [{ hotel_service_id: "service-b", quantity: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await db.select().from(bookings).where(eq(bookings.id, hold.booking_id)))[0]?.status).toBe("held");
  });

  it("rejects inactive add-on service IDs", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(hotelServices).values({ id: "inactive-service", hotelId: "a", name: "Inactive", pricingModel: "ONE_TIME", unitPrice: "1.00", isActive: false });
    const hold = await holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-02", adults: 2, children: [] });
    await expect(confirmBookingDetails(db, publicCaller, { booking_id: hold.booking_id, hotel_id: "a", guest_name: "Guest", services: [{ hotel_service_id: "inactive-service", quantity: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await db.select().from(bookings).where(eq(bookings.id, hold.booking_id)))[0]?.status).toBe("held");
  });

  it("lets staff book a free room over dates another room already has, but not the taken room", async () => {
    await seedHotel("a", "owner-a", { quantity: 2 });
    await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-01", "2026-11-03"), []);
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-02", "2026-11-04"), []))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: /no longer available/ });
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-2", "confirmed", "2026-11-02", "2026-11-04"), []))
      .resolves.toMatchObject({ room_id: "room-a-2" });
  });

  it("refuses a hold on an unavailable room", async () => {
    await seedHotel("a", "owner-a");
    await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-01", "2026-11-03"), []);
    await expect(holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-01", check_out: "2026-11-03", adults: 2, children: [] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: /no longer available/ });
    await expect(holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-02", check_out: "2026-11-03", adults: 2, children: [] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: /no longer available/ });
    await expect(holdRoomType(db, publicCaller, { slug: "a-slug", room_type_id: "type-a", check_in: "2026-11-03", check_out: "2026-11-04", adults: 2, children: [] }))
      .resolves.toMatchObject({ room_type_name: "Standard" });
  });

  it("transitions check-in/out with scoped audit and denies cross-hotel ids", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(bookings).values({ id: "confirmed-a", hotelId: "a", roomId: "room-a-1", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
    await db.insert(bookings).values({ id: "confirmed-b", hotelId: "b", roomId: "room-b-1", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-b", hotel_id: "b", to_status: "checked_in" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-a", hotel_id: "a", to_status: "checked_in" })).resolves.toMatchObject({ from_status: "confirmed" });
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "confirmed-a"))).toHaveLength(1);
    await expect(transitionBookingStatus(db, ownerA, { booking_id: "confirmed-a", hotel_id: "a", to_status: "checked_out" })).resolves.toMatchObject({ from_status: "checked_in" });
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "confirmed-a"))).toEqual([]);
    await expect(createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-01", "2026-11-02"), []))
      .resolves.toMatchObject({ check_in: "2026-11-01" });
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

  it("proves that a non-applied booking statement still adds no nights", async () => {
    await seedHotel("a", "owner-a");
    const now = new Date("2026-10-28T00:00:00Z");

    // Case 1: Non-applied INSERT statement
    const failedInsert = db.$client.prepare(`INSERT INTO bookings
      (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
      SELECT 'never-inserted', 'a', 'room-a-1', 'Ghost', '2026-11-01', '2026-11-03', '100.00', 'manual', 'confirmed'
      WHERE 1 = 0`).bind();
    await db.$client.batch([
      failedInsert,
      addNightsStatement(db, "never-inserted", getStayDates("2026-11-01", "2026-11-03"), now),
    ]);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "never-inserted"))).toEqual([]);

    // Case 2: Existing confirmed booking with a non-applied UPDATE statement
    const created = await createBookingWithGuests(db, ownerA, bookingInput("a", "room-a-1", "confirmed", "2026-11-01", "2026-11-03"), []);
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, created.id))).map(r => r.night).sort())
      .toEqual(["2026-11-01", "2026-11-02"]);

    // Attempt non-applied update to new dates 2026-11-10..2026-11-12
    const failedUpdate = db.$client.prepare(`UPDATE bookings
      SET check_in = '2026-11-10', check_out = '2026-11-12'
      WHERE id = ? AND 1 = 0`).bind(created.id);
    const conditionalDelete = db.$client.prepare(`DELETE FROM booking_nights
      WHERE booking_id = ?
        AND EXISTS (
          SELECT 1 FROM bookings
          WHERE id = ? AND check_in = '2026-11-10' AND check_out = '2026-11-12' AND room_id = 'room-a-1' AND status = 'confirmed'
        )`).bind(created.id, created.id);

    await db.$client.batch([
      failedUpdate,
      conditionalDelete,
      addNightsStatement(db, created.id, getStayDates("2026-11-10", "2026-11-12"), now),
    ]);

    // Nights for 2026-11-10..2026-11-12 are NOT added; original nights remain intact
    const afterNights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, created.id));
    expect(afterNights.map(r => r.night).sort()).toEqual(["2026-11-01", "2026-11-02"]);
  });
});

describe("claimBookingNights", () => {
  const now = new Date("2026-10-31T00:00:00.000Z");
  const insertBooking = (id: string, status: string) => db.insert(bookings).values({ id, hotelId: "a", roomId: "room-a-1", guestName: id, checkIn: "2026-11-01", checkOut: "2026-11-03", price: "100.00", source: "manual", status, expiresAt: null });

  it("claims the nights a resubmitted booking lost while the room is still free", async () => {
    await seedHotel("a", "owner-a");
    await insertBooking("resubmitted", "pending_verification");

    await expect(bookingRepository.claimBookingNights(db, ownerA, "a", "resubmitted", now)).resolves.toBe(true);

    const nights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "resubmitted"));
    expect(nights.map(night => night.night).sort()).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("refuses when another booking took the room in the meantime", async () => {
    await seedHotel("a", "owner-a");
    await insertBooking("other", "confirmed");
    await db.$client.batch([addNightsStatement(db, "other", getStayDates("2026-11-01", "2026-11-03"), now)]);
    await insertBooking("resubmitted", "pending_verification");

    await expect(bookingRepository.claimBookingNights(db, ownerA, "a", "resubmitted", now)).resolves.toBe(false);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "resubmitted"))).toEqual([]);
  });

  it("refuses a booking that no longer occupies inventory", async () => {
    await seedHotel("a", "owner-a");
    await insertBooking("rejected", "payment_rejected");

    await expect(bookingRepository.claimBookingNights(db, ownerA, "a", "rejected", now)).resolves.toBe(false);
  });

  it("is allowed for the guest payment caller of that hotel only", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await insertBooking("resubmitted", "pending_verification");
    const { createD1GuestPaymentCallerContext } = await import("../db/scope");

    await expect(bookingRepository.claimBookingNights(db, createD1GuestPaymentCallerContext("a"), "a", "resubmitted", now)).resolves.toBe(true);
    await expect(bookingRepository.claimBookingNights(db, createD1GuestPaymentCallerContext("b"), "a", "resubmitted", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
