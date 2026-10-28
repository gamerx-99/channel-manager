import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, roomTypes } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createRateOverride, listRateOverrides } from "./availability";

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

describe("D1 availability repository", () => {
  it("rejects cross-hotel reads and writes", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await createRateOverride(db, { userId: "owner-b" }, { hotelId: "b", roomTypeId: "rt-b", startDate: "2026-11-01", endDate: "2026-11-02", overridePrice: 120, minStayNights: null });
    await expect(listRateOverrides(db, { userId: "owner-a" }, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createRateOverride(db, { userId: "owner-a" }, { hotelId: "b", roomTypeId: "rt-b", startDate: "2026-11-04", endDate: "2026-11-05", overridePrice: 130, minStayNights: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("atomically rejects a second rate override over the same date range", async () => {
    await seedHotel("a", "owner-a");
    const input = { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-03", overridePrice: 120, minStayNights: null };
    await createRateOverride(db, { userId: "owner-a" }, input);
    await expect(createRateOverride(db, { userId: "owner-a" }, input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
