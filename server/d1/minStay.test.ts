import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, rateOverrides, roomTypes } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { assertBookingMinStay, createRateOverride } from "./availability";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
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
});

afterEach(() => sqlite.close());

async function seedHotel(id: string, owner: string) {
  await db.insert(hotels).values({ id, name: id, slug: id, address: "address", ownerContact: owner });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: `rt-${id}`, hotelId: id, name: "Room", capacity: 2, basePrice: 100 });
}

describe("min stay", () => {
  it("returns the max overlapping min stay", async () => {
    await seedHotel("a", "owner-a");
    await createRateOverride(db, { userId: "owner-a" }, { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-10", overridePrice: "120.00", minStayNights: 4 });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-06", "2026-11-08")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Booking must be at least 4 nights." });
  });

  it("rejects a violating booking naming the minimum", async () => {
    await seedHotel("a", "owner-a");
    await createRateOverride(db, { userId: "owner-a" }, { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-10", overridePrice: "120.00", minStayNights: 3 });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-01", "2026-11-03")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Booking must be at least 3 nights." });
  });

  it("uses singular wording for min 1", async () => {
    await seedHotel("a", "owner-a");
    await createRateOverride(db, { userId: "owner-a" }, { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-10", overridePrice: "120.00", minStayNights: 1 });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-02", "2026-11-02")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Booking must be at least 1 night." });
  });

  it("allows a booking meeting the min stay", async () => {
    await seedHotel("a", "owner-a");
    await createRateOverride(db, { userId: "owner-a" }, { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-10", overridePrice: "120.00", minStayNights: 3 });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-01", "2026-11-04")).resolves.toBeUndefined();
  });
});
