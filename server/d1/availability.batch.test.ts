import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { availability, bookings, d1Schema, hotelUsers, hotels, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { AVAILABILITY_BATCH_MAX_DAYS } from "@shared/availabilityBatch";
import { listAvailabilityForHotel, listCalendarForHotel, saveCalendarRange, updateAvailability, updateAvailabilityBatch } from "./availability";
import { resolveRateSatang } from "./bookingService";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let batchCalls = 0;
let statementsPerBatch: number[] = [];

beforeEach(() => {
  batchCalls = 0;
  statementsPerBatch = [];
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, name), "utf8");
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
    // Like D1: every statement of one batch runs in a single transaction.
    batch: async statements => {
      batchCalls += 1;
      statementsPerBatch.push(statements.length);
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => {
          const { query, params } = statement as { query: string; params: unknown[] };
          const result = sqlite.prepare(query).run(...params);
          return { meta: { changes: Number(result.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
});

afterEach(() => sqlite.close());

const owner = { userId: "owner-a" };

describe("stop-sell migration", () => {
  it("adds the saved allotment field without changing existing availability rows", () => {
    const legacyDb = new DatabaseSync(":memory:");
    try {
      const migrationFiles = readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort();
      for (const name of migrationFiles.filter(file => file !== "20261109010000_restore_stop_sell_allotment.sql")) {
        const source = readFileSync(resolve(migrationFolder, name), "utf8");
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) legacyDb.exec(statement);
      }
      legacyDb.exec("PRAGMA foreign_keys = OFF");
      legacyDb.exec("INSERT INTO availability (id, room_type_id, date, price, rooms_available) VALUES ('legacy-open', 'legacy-type', '2026-12-01', '1200.00', 2), ('legacy-stop', 'legacy-type', '2026-12-02', '900.00', 0)");
      legacyDb.exec(readFileSync(resolve(migrationFolder, "20261109010000_restore_stop_sell_allotment.sql"), "utf8"));
      expect(legacyDb.prepare("SELECT id, date, price, rooms_available, reopen_rooms_available FROM availability ORDER BY date").all()).toEqual([
        { id: "legacy-open", date: "2026-12-01", price: "1200.00", rooms_available: 2, reopen_rooms_available: null },
        { id: "legacy-stop", date: "2026-12-02", price: "900.00", rooms_available: 0, reopen_rooms_available: null },
      ]);
    } finally {
      legacyDb.close();
    }
  });
});

async function seedHotel(id: string, ownerId: string, types: Array<{ id: string; basePrice: string; roomCount: number }>) {
  await db.insert(hotels).values({ id, name: id, slug: id, address: "address", ownerContact: ownerId });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: ownerId, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  for (const type of types) {
    await db.insert(roomTypes).values({ id: type.id, hotelId: id, name: type.id, capacity: 2, basePrice: type.basePrice });
    for (let index = 0; index < type.roomCount; index += 1) await db.insert(rooms).values({ id: `${type.id}-room-${index}`, hotelId: id, roomTypeId: type.id, roomNumber: `${type.id}-${index}` });
  }
}

describe("updateAvailabilityBatch", () => {
  it("writes every room type and day in one batch call (regression: one request per room type and day)", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-1", basePrice: "1000.00", roomCount: 2 }, { id: "rt-2", basePrice: "1500.00", roomCount: 3 }, { id: "rt-3", basePrice: "2000.00", roomCount: 1 }]);
    const result = await updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-1", "rt-2", "rt-3"], startDate: "2026-12-01", endDate: "2026-12-30", roomsAvailable: 0 });
    expect(result).toEqual({ rows: 90, roomTypes: 3, days: 30, roomsAvailable: 0 });
    expect(batchCalls).toBe(1);
    expect(statementsPerBatch[0]).toBeLessThanOrEqual(6); // 90 rows at 16 per statement
    const rows = await listAvailabilityForHotel(db, owner, "a");
    expect(rows).toHaveLength(90);
    expect(rows.every(row => row.roomsAvailable === 0)).toBe(true);
    const first = rows.find(row => row.roomTypeId === "rt-2" && row.date === "2026-12-01");
    expect(Number(first?.price)).toBe(1500);
  });

  it("changes only the rooms offered on an existing row and keeps its price", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-1", basePrice: "1000.00", roomCount: 4 }]);
    await updateAvailability(db, owner, { hotelId: "a", roomTypeId: "rt-1", date: "2026-12-02", price: "1234.00", roomsAvailable: 4 });
    await updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-1"], startDate: "2026-12-01", endDate: "2026-12-03", roomsAvailable: 2 });
    const rows = await listAvailabilityForHotel(db, owner, "a");
    expect(rows.map(row => [row.date, row.roomsAvailable, Number(row.price)])).toEqual([
      ["2026-12-01", 2, 1000],
      ["2026-12-02", 2, 1234],
      ["2026-12-03", 2, 1000],
    ]);
  });

  it("can reopen a stopped range with a second call", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-1", basePrice: "1000.00", roomCount: 2 }]);
    const range = { hotelId: "a", roomTypeIds: ["rt-1"], startDate: "2026-12-01", endDate: "2026-12-05" };
    await updateAvailabilityBatch(db, owner, { ...range, roomsAvailable: 0 });
    await updateAvailabilityBatch(db, owner, { ...range, roomsAvailable: 2 });
    const rows = await listAvailabilityForHotel(db, owner, "a");
    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.roomsAvailable === 2)).toBe(true);
  });

  it("preserves a reduced cap on single-day stop-sell reopen and enforces stop-sell-only permission", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-1", basePrice: "1000.00", roomCount: 3 }]);
    await db.insert(hotelUsers).values({ id: "m-stop", hotelId: "a", userId: "stop-only", role: "front_desk", permissionGrants: ["revenue.manage_stop_sell"], permissionRevokes: [] });
    const input = { hotelId: "a", roomTypeId: "rt-1", date: "2026-12-01", price: "1000.00" };
    await updateAvailability(db, owner, { ...input, roomsAvailable: 1, action: "allotment" });
    await updateAvailability(db, owner, { ...input, price: "2000.00", roomsAvailable: 1, action: "rate" });
    await updateAvailability(db, { userId: "stop-only" }, { ...input, price: "0", roomsAvailable: 0, action: "stop_sell", defaultRoomsAvailable: 3 });
    await updateAvailability(db, { userId: "stop-only" }, { ...input, price: "0", roomsAvailable: 3, action: "stop_sell", defaultRoomsAvailable: 3 });
    await expect(updateAvailability(db, { userId: "stop-only" }, { ...input, roomsAvailable: 2, action: "allotment" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(availability))[0]).toMatchObject({ price: "2000.00", roomsAvailable: 1, reopenRoomsAvailable: null });
  });

  it("preserves different nightly caps when stop-sell-only staff close and reopen a batch", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-1", basePrice: "1000.00", roomCount: 3 }]);
    await db.insert(hotelUsers).values({ id: "m-stop", hotelId: "a", userId: "stop-only", role: "front_desk", permissionGrants: ["revenue.manage_stop_sell"], permissionRevokes: [] });
    await updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-1"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 1 });
    const range = { hotelId: "a", roomTypeIds: ["rt-1"], startDate: "2026-12-01", endDate: "2026-12-02" };
    await updateAvailabilityBatch(db, { userId: "stop-only" }, { ...range, roomsAvailable: 0, action: "stop_sell" });
    await updateAvailabilityBatch(db, { userId: "stop-only" }, { ...range, roomsAvailable: 3, action: "stop_sell" });
    await expect(updateAvailabilityBatch(db, { userId: "stop-only" }, { ...range, roomsAvailable: 2, action: "allotment" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rows = await db.select().from(availability).orderBy(availability.date);
    expect(rows.map(row => [row.roomsAvailable, row.reopenRoomsAvailable])).toEqual([[1, null], [1, null]]);
  });

  it("rejects another hotel's rooms and unknown room types without writing", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await seedHotel("b", "owner-b", [{ id: "rt-b", basePrice: "1000.00", roomCount: 1 }]);
    await expect(updateAvailabilityBatch(db, owner, { hotelId: "b", roomTypeIds: ["rt-b"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-b"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-a", "missing"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(availability)).toHaveLength(0);
  });

  it("rejects more rooms than exist, bad counts and ranges that are too long or backwards", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 2 }]);
    const base = { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 0 };
    await expect(updateAvailabilityBatch(db, owner, { ...base, roomsAvailable: 3 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateAvailabilityBatch(db, owner, { ...base, roomsAvailable: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateAvailabilityBatch(db, owner, { ...base, roomsAvailable: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateAvailabilityBatch(db, owner, { ...base, startDate: "2026-12-05", endDate: "2026-12-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateAvailabilityBatch(db, owner, { ...base, startDate: "2026-01-01", endDate: "2026-12-31" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(AVAILABILITY_BATCH_MAX_DAYS).toBe(62);
    expect(await db.select().from(availability)).toHaveLength(0);
  });

  it("stays atomic: a failing statement leaves no partial rows", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    const original = db.$client.batch;
    db.$client.batch = async statements => original([...statements, { query: "insert into availability (id, room_type_id, date, price, rooms_available) values ('bad', 'no-such-type', '2026-12-01', '1.00', 0)", params: [] } as never]);
    await expect(updateAvailabilityBatch(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-20", roomsAvailable: 0 })).rejects.toThrow();
    expect(await db.select().from(availability)).toHaveLength(0);
  });
});

describe("saveCalendarRange pricing and allotment", () => {
  it("writes nothing when one selected room type is invalid", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await expect(saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a", "missing"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 1, price: "1200.00" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(availability)).toHaveLength(0);
    expect(await db.select().from(rateOverrides)).toHaveLength(0);
  });

  it("writes rooms for sale with allotment permission only and leaves rate overrides untouched", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 2 }]);
    await db.insert(hotelUsers).values({ id: "m-allotment", hotelId: "a", userId: "allotment", role: "front_desk", permissionGrants: ["revenue.manage_allotment"], permissionRevokes: [] });
    const before = await db.select().from(rateOverrides);
    await saveCalendarRange(db, { userId: "allotment" }, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 1 });
    expect(await db.select().from(rateOverrides)).toEqual(before);
    expect(await db.select().from(availability)).toHaveLength(2);
  });

  it("allows stop-sell-only staff to close and restore a range without changing the saved allotment", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 3 }]);
    await db.insert(hotelUsers).values({ id: "m-stop", hotelId: "a", userId: "stop-only", role: "front_desk", permissionGrants: ["revenue.manage_stop_sell"], permissionRevokes: [] });
    await saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-02", roomsAvailable: 2 });
    const range = { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-02", availabilityAction: "stop_sell" as const };
    await saveCalendarRange(db, { userId: "stop-only" }, { ...range, roomsAvailable: 0 });
    await saveCalendarRange(db, { userId: "stop-only" }, { ...range, roomsAvailable: 3 });
    await expect(saveCalendarRange(db, { userId: "stop-only" }, { ...range, availabilityAction: "allotment", roomsAvailable: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rows = await db.select().from(availability).orderBy(availability.date);
    expect(rows.map(row => row.roomsAvailable)).toEqual([2, 2]);
  });

  it("does not create overrides or delete existing ones when price is null", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-01", endDate: "2026-12-03", price: null });
    expect(await db.select().from(rateOverrides)).toHaveLength(0);
    await db.insert(rateOverrides).values({ id: "ov-a", roomTypeId: "rt-a", startDate: "2026-12-01", endDate: "2026-12-03", overridePrice: "1200.00", minStayNights: null });
    await saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-02", endDate: "2026-12-02", price: null });
    expect(await db.select().from(rateOverrides)).toMatchObject([{ id: "ov-a", startDate: "2026-12-01", endDate: "2026-12-03" }]);
  });

  it("preserves two different nightly override prices when changing minimum stay", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await db.insert(rateOverrides).values([
      { id: "ov-a", roomTypeId: "rt-a", startDate: "2026-12-01", endDate: "2026-12-02", overridePrice: "1200.00", minStayNights: 2 },
      { id: "ov-b", roomTypeId: "rt-a", startDate: "2026-12-03", endDate: "2026-12-04", overridePrice: "1400.00", minStayNights: 3 },
    ]);
    await saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-02", endDate: "2026-12-03", minStayNights: 1 });
    const rows = await db.select().from(rateOverrides).orderBy(rateOverrides.startDate);
    expect(rows.map(row => [row.startDate, row.endDate, row.overridePrice, row.minStayNights])).toEqual([
      ["2026-12-01", "2026-12-01", "1200.00", 2],
      ["2026-12-02", "2026-12-02", "1200.00", 1],
      ["2026-12-03", "2026-12-03", "1400.00", 1],
      ["2026-12-04", "2026-12-04", "1400.00", 3],
    ]);
  });

  it("splits a base-priced middle range into two pieces with the original price", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await db.insert(rateOverrides).values({ id: "ov-a", roomTypeId: "rt-a", startDate: "2026-12-01", endDate: "2026-12-05", overridePrice: "1200.00", minStayNights: null });
    await saveCalendarRange(db, owner, { hotelId: "a", roomTypeIds: ["rt-a"], startDate: "2026-12-03", endDate: "2026-12-03", base: true });
    const rows = await db.select().from(rateOverrides).orderBy(rateOverrides.startDate);
    expect(rows.map(row => [row.startDate, row.endDate, row.overridePrice])).toEqual([
      ["2026-12-01", "2026-12-02", "1200.00"], ["2026-12-04", "2026-12-05", "1200.00"],
    ]);
  });

  it("keeps days without availability open and subtracts booked inventory", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 3 }]);
    await db.insert(bookings).values({ id: "bkg-a", hotelId: "a", roomId: "rt-a-room-0", guestName: "Guest", checkIn: "2026-12-02", checkOut: "2026-12-03", price: 1000, source: "manual", status: "confirmed" });
    const result = await listCalendarForHotel(db, owner, "a", "2026-12-01", "2026-12-02");
    expect(result.rows.map(row => [row.closed, row.availableRooms])).toEqual([[false, 3], [false, 2]]);
  });

  it("matches resolveRateSatang for equal-width overlapping overrides", async () => {
    await seedHotel("a", "owner-a", [{ id: "rt-a", basePrice: "1000.00", roomCount: 1 }]);
    await db.insert(rateOverrides).values([
      { id: "ov-a", roomTypeId: "rt-a", startDate: "2026-12-01", endDate: "2026-12-03", overridePrice: "1200.00", minStayNights: null, createdAt: new Date("2026-11-01T00:00:00Z") },
      { id: "ov-z", roomTypeId: "rt-a", startDate: "2026-12-01", endDate: "2026-12-03", overridePrice: "1300.00", minStayNights: null, createdAt: new Date("2026-11-02T00:00:00Z") },
    ]);
    const overrides = await db.select().from(rateOverrides);
    const calendar = await listCalendarForHotel(db, owner, "a", "2026-12-01", "2026-12-04");
    const expected = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"].map(date => {
      const satang = resolveRateSatang("rt-a", "1000.00", date, overrides);
      return `${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, "0")}`;
    });
    expect(calendar.rows.map(row => row.price)).toEqual(expected);
    expect(expected).toEqual(["1300.00", "1300.00", "1300.00", "1000.00"]);
  });
});
