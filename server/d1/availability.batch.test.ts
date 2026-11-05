import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { availability, d1Schema, hotelUsers, hotels, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { AVAILABILITY_BATCH_MAX_DAYS } from "@shared/availabilityBatch";
import { listAvailabilityForHotel, updateAvailability, updateAvailabilityBatch } from "./availability";

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
    expect(statementsPerBatch[0]).toBeLessThanOrEqual(6); // 90 rows at 18 per statement
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
