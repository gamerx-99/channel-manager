import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { availability, bookingNights, bookings, bookingStatusLog, d1Schema, hotelPaymentSettings, hotels, hotelUsers, otaConnections, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createD1GuestPaymentCallerContext, createD1SystemCallerContext } from "../db/scope";
import { claimBookingNights, confirmBookingDetails, createBookingWithGuests, createPublicBooking, expireBookingIfPast, getPublicHotelAvailability, holdRoomType } from "./booking";
import { getPublicRoomTypeAvailability } from "./bookingService";
import { syncOtaIcalBlocks } from "./ota";

// Same in-memory D1 harness as booking.test.ts. Phase 1 of specs/20: rooms_available = 0 closes a night for guests.
const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
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
const owner = { userId: "owner-a" };
const NOW = new Date("2026-10-28T00:00:00Z");
const slug = "a-slug";

async function seed(quantity = 2) {
  await db.insert(hotels).values({ id: "a", name: "Hotel a", slug, address: "Address", ownerContact: "a@example.test", publicEnabled: true });
  await db.insert(hotelPaymentSettings).values({ hotelId: "a", promptpayId: "0812345678" });
  await db.insert(hotelUsers).values({ id: "membership-a", hotelId: "a", userId: "owner-a", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: "type-a", hotelId: "a", name: "Standard", capacity: 2, basePrice: "100.00", baseOccupancy: 2, maxOccupancy: 2, occupancyPricing: { "1": { enabled: false, mode: "percent", value: -10 }, "2": { enabled: true, mode: "percent", value: 0 } }, childRates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } } });
  for (let i = 1; i <= quantity; i++) await db.insert(rooms).values({ id: `room-a-${i}`, hotelId: "a", roomTypeId: "type-a", roomNumber: String(i).padStart(3, "0") });
}
const setNight = (date: string, roomsAvailable: number) => db.insert(availability).values({ roomTypeId: "type-a", date, price: "100.00", roomsAvailable });
const close = (date: string) => setNight(date, 0);
const offered = async (checkIn: string, checkOut: string) =>
  (await getPublicHotelAvailability(db, publicCaller, slug, checkIn, checkOut, { adults: 2, children: [] }, NOW)).room_types.map(row => row.id);
const holdInput = (checkIn: string, checkOut: string) => ({ slug, room_type_id: "type-a", check_in: checkIn, check_out: checkOut, adults: 2, children: [] });
const publicInput = (checkIn: string, checkOut: string, guest_name = "Guest") => ({ slug, room_type_id: "type-a", guest_name, check_in: checkIn, check_out: checkOut });
const staffInput = (checkIn: string, checkOut: string) => ({
  hotel_id: "a", room_id: "room-a-1", guest_name: "Staff Guest", check_in: checkIn, check_out: checkOut, price: "100.00",
  source: "phone" as const, status: "confirmed" as const, payment_status: "unpaid" as const, created_at: "2026-10-01T00:00:00.000Z", rooms: null, guests: [], adults_count: 2,
});

describe("closed nights for guests", () => {
  it("counts positive allotment against active booking nights and prevents concurrent overbooking", async () => {
    await seed(2);
    await setNight("2026-11-02", 1);
    const results = await Promise.allSettled([
      holdRoomType(db, publicCaller, holdInput("2026-11-02", "2026-11-03"), NOW),
      holdRoomType(db, publicCaller, holdInput("2026-11-02", "2026-11-03"), NOW),
    ]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(bookingNights)).toHaveLength(1);
    expect(await offered("2026-11-02", "2026-11-03")).toEqual([]);
  });

  it("keeps existing booking nights when online allotment is closed afterward", async () => {
    await seed(2);
    await setNight("2026-11-02", 2);
    const created = await createPublicBooking(db, publicCaller, publicInput("2026-11-02", "2026-11-03"), NOW);
    await db.$client.batch([db.$client.prepare("update availability set rooms_available = 0 where room_type_id = ? and date = ?").bind("type-a", "2026-11-02")]);

    expect(await db.select({ status: bookings.status }).from(bookings)).toEqual([{ status: "confirmed" }]);
    expect(await db.select().from(bookingNights)).toHaveLength(1);
    await expect(holdRoomType(db, publicCaller, holdInput("2026-11-02", "2026-11-03"), NOW)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(created.success).toBe(true);
  });

  it("does not reclaim a rejected guest payment after another booking consumes the online cap", async () => {
    await seed(2);
    await setNight("2026-11-02", 1);
    const rejected = await createPublicBooking(db, publicCaller, publicInput("2026-11-02", "2026-11-03"), NOW);
    await db.update(bookings).set({ status: "payment_rejected" }).where(eq(bookings.id, rejected.booking_id));
    await db.$client.batch([db.$client.prepare("delete from booking_nights where booking_id = ?").bind(rejected.booking_id)]);
    await holdRoomType(db, publicCaller, holdInput("2026-11-02", "2026-11-03"), NOW);

    expect(await claimBookingNights(db, createD1GuestPaymentCallerContext("a"), "a", rejected.booking_id, NOW)).toBe(false);
  });

  it("does not offer a stay with one closed night and refuses to insert it", async () => {
    await seed();
    await close("2026-11-02");
    expect(await offered("2026-11-01", "2026-11-04")).toEqual([]);
    expect((await getPublicRoomTypeAvailability(db, publicCaller, "a", "2026-11-01", "2026-11-04", NOW)).find(row => row.room_type_id === "type-a")?.rooms_available).toBe(0);
    await expect(holdRoomType(db, publicCaller, holdInput("2026-11-01", "2026-11-04"), NOW)).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/no longer available/) });
    await expect(createPublicBooking(db, publicCaller, publicInput("2026-11-01", "2026-11-04"), NOW)).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/no longer available/) });
    expect(await db.select().from(bookings)).toEqual([]);
    expect(await db.select().from(bookingNights)).toEqual([]);
  });

  it("refuses both of two racing requests and leaves no records", async () => {
    await seed(2);
    await close("2026-11-02");
    const results = await Promise.allSettled([
      holdRoomType(db, publicCaller, holdInput("2026-11-01", "2026-11-03"), NOW),
      createPublicBooking(db, publicCaller, publicInput("2026-11-01", "2026-11-03"), NOW),
      holdRoomType(db, publicCaller, holdInput("2026-11-02", "2026-11-03"), NOW),
    ]);
    expect(results.map(result => result.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(await db.select().from(bookings)).toEqual([]);
  });

  it("refuses a request that was offered before the night was closed", async () => {
    await seed();
    expect(await offered("2026-11-01", "2026-11-03")).toEqual(["type-a"]);
    await close("2026-11-01");
    await expect(holdRoomType(db, publicCaller, holdInput("2026-11-01", "2026-11-03"), NOW)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ignores a closed night outside the stay and treats check-out day as not a night", async () => {
    await seed();
    await close("2026-11-03"); // the check-out day
    await close("2026-10-31"); // the night before check-in
    expect(await offered("2026-11-01", "2026-11-03")).toEqual(["type-a"]);
    await expect(createPublicBooking(db, publicCaller, publicInput("2026-11-01", "2026-11-03"), NOW)).resolves.toMatchObject({ success: true });
    await expect(holdRoomType(db, publicCaller, holdInput("2026-11-01", "2026-11-03"), NOW)).resolves.toMatchObject({ nights: 2 });
    expect(await offered("2026-11-02", "2026-11-04")).toEqual([]);
  });

  it("treats a missing row, and a row that is not zero, as open", async () => {
    await seed();
    await setNight("2026-11-02", 1);
    expect(await offered("2026-11-01", "2026-11-04")).toEqual(["type-a"]);
    await expect(createPublicBooking(db, publicCaller, publicInput("2026-11-01", "2026-11-04"), NOW)).resolves.toMatchObject({ success: true });
  });

  it("ignores rows in the past (Thai-time day)", async () => {
    await seed();
    await close("2026-11-05");
    const later = new Date("2026-11-10T00:00:00Z");
    await expect(createPublicBooking(db, publicCaller, publicInput("2026-11-05", "2026-11-07"), later)).resolves.toMatchObject({ success: true });
    // Thai day: 2026-11-04T18:00Z is already 2026-11-05 in Bangkok, so the row still counts.
    await expect(holdRoomType(db, publicCaller, holdInput("2026-11-05", "2026-11-06"), new Date("2026-11-04T18:00:00Z"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("only closes the room type that has the row", async () => {
    await seed();
    await db.insert(roomTypes).values({ id: "type-b", hotelId: "a", name: "Suite", capacity: 2, basePrice: "200.00", baseOccupancy: 2, maxOccupancy: 2, occupancyPricing: { "2": { enabled: true, mode: "percent", value: 0 } }, childRates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } } });
    await db.insert(rooms).values({ id: "room-b-1", hotelId: "a", roomTypeId: "type-b", roomNumber: "201" });
    await close("2026-11-01");
    expect(await offered("2026-11-01", "2026-11-02")).toEqual(["type-b"]);
  });
});

describe("staff and OTA bookings with closed nights", () => {
  it("blocks staff without an override, naming the nights, and writes nothing", async () => {
    await seed();
    await close("2026-11-01");
    await close("2026-11-02");
    const error = await createBookingWithGuests(db, owner, staffInput("2026-11-01", "2026-11-04"), [], [], NOW).catch(e => e);
    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(String(error.message)).toMatch(/^STOP_SELL/);
    expect(error.message).toContain("2026-11-01");
    expect(error.message).toContain("2026-11-02");
    expect(error.message).not.toContain("2026-11-03");
    expect(await db.select().from(bookings)).toEqual([]);
  });

  it("lets staff book a closed night with the override and logs stop_sell_override", async () => {
    await seed();
    await close("2026-11-01");
    const created = await createBookingWithGuests(db, owner, staffInput("2026-11-01", "2026-11-03"), [], [], NOW, { overrideStopSell: true });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, created.id))).map(row => row.reason)).toEqual(["stop_sell_override"]);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, created.id))).toHaveLength(2);
  });

  it("keeps the normal reason when no night is closed, with or without the override", async () => {
    await seed();
    const first = await createBookingWithGuests(db, owner, staffInput("2026-11-01", "2026-11-02"), [], [], NOW, { overrideStopSell: true });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, first.id))).map(row => row.reason)).toEqual(["booking_created"]);
  });

  it("never refuses an OTA iCal block on a closed night", async () => {
    await seed();
    await close("2026-11-02");
    await db.insert(otaConnections).values({ id: "ota-a", hotelId: "a", provider: "Trip", status: "connected", roomId: "room-a-1", icalExportToken: "a".repeat(64) });
    const outcome = await syncOtaIcalBlocks(db, createD1SystemCallerContext(), "ota-a", [{ uid: "u1", start: "2026-11-01", end: "2026-11-04" }], {}, NOW);
    expect(outcome.conflicts).toEqual([]);
    expect((await db.select().from(bookings).where(eq(bookings.source, "ota_ical")))).toHaveLength(1);
    expect(await db.select().from(bookingNights)).toHaveLength(3);
  });
});

describe("holds still release the right nights", () => {
  it("confirms an existing hold after a night is closed, and releases its nights on expiry", async () => {
    await seed();
    const hold = await holdRoomType(db, publicCaller, holdInput("2026-11-01", "2026-11-03"), NOW);
    await close("2026-11-02"); // a later close never cancels or blocks what a guest already holds
    await expect(confirmBookingDetails(db, publicCaller, { booking_id: hold.booking_id, hotel_id: "a", guest_name: "Guest" }, NOW)).resolves.toMatchObject({ status: "pending_payment" });
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, hold.booking_id))).toHaveLength(2);
    await expect(expireBookingIfPast(db, publicCaller, hold.booking_id, "a", new Date(NOW.getTime() + 60 * 60_000))).resolves.toMatchObject({ status: "expired" });
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, hold.booking_id))).toEqual([]);
  });
});
