import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { availability, bookings, d1Schema, hotelUsers, hotels, roomTypes } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { assertBookingMinStay, createRateOverride, deleteRateOverride, listAvailabilityForHotel, listBookingOccupancyForHotel, listRateOverrides, listRateOverridesForRoomType, updateAvailability } from "./availability";

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
    const foreignOverride = await createRateOverride(db, { userId: "owner-b" }, { hotelId: "b", roomTypeId: "rt-b", startDate: "2026-11-01", endDate: "2026-11-02", overridePrice: "120.00", minStayNights: null });
    await expect(listRateOverrides(db, { userId: "owner-a" }, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listRateOverridesForRoomType(db, { userId: "owner-a" }, "b", "rt-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createRateOverride(db, { userId: "owner-a" }, { hotelId: "b", roomTypeId: "rt-b", startDate: "2026-11-04", endDate: "2026-11-05", overridePrice: "130.00", minStayNights: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteRateOverride(db, { userId: "owner-a" }, "b", foreignOverride.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "b", "rt-b", "2026-11-01", "2026-11-02")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateAvailability(db, { userId: "owner-a" }, { hotelId: "b", roomTypeId: "rt-b", date: "2026-11-01", price: "90.00", roomsAvailable: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAvailabilityForHotel(db, { userId: "owner-a" }, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBookingOccupancyForHotel(db, { userId: "owner-a" }, "b", "2026-11-01", "2026-11-03")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("atomically rejects a second rate override over the same date range", async () => {
    await seedHotel("a", "owner-a");
    const input = { hotelId: "a", roomTypeId: "rt-a", startDate: "2026-11-01", endDate: "2026-11-03", overridePrice: "120.00", minStayNights: 3 };
    await createRateOverride(db, { userId: "owner-a" }, input);
    await expect(createRateOverride(db, { userId: "owner-a" }, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-01", "2026-11-03")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await assertBookingMinStay(db, { userId: "owner-a" }, "a", "rt-a", "2026-11-01", "2026-11-04")).toBeUndefined();
    expect(await listRateOverridesForRoomType(db, { userId: "owner-a" }, "a", "rt-a")).toHaveLength(1);
    const override = (await listRateOverrides(db, { userId: "owner-a" }, "a"))[0];
    expect(await deleteRateOverride(db, { userId: "owner-a" }, "a", override.id)).toEqual({ id: override.id });
  });

  it("lists scoped availability and occupancy and upserts an allotment", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(bookings).values({ id: "bkg-a", hotelId: "a", guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-03", price: 100, source: "manual", status: "confirmed" });
    expect(await listBookingOccupancyForHotel(db, { userId: "owner-a" }, "a", "2026-11-02", "2026-11-04")).toHaveLength(1);
    expect(await listBookingOccupancyForHotel(db, { userId: "owner-a" }, "a", "2026-11-03", "2026-11-04")).toHaveLength(0);
    await expect(listBookingOccupancyForHotel(db, { userId: "owner-a" }, "b", "2026-11-01", "2026-11-02")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const input = { hotelId: "a", roomTypeId: "rt-a", date: "2026-11-01", price: "123.45", roomsAvailable: 2 };
    await updateAvailability(db, { userId: "owner-a" }, input);
    await updateAvailability(db, { userId: "owner-a" }, { ...input, price: "130.00", roomsAvailable: 1 });
    const rows = await listAvailabilityForHotel(db, { userId: "owner-a" }, "a");
    expect(rows).toHaveLength(1);
    expect(rows[0].roomsAvailable).toBe(1);
    expect(Number(rows[0].price)).toBe(130);
    await expect(listAvailabilityForHotel(db, { userId: "owner-a" }, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateAvailability(db, { userId: "owner-a" }, { ...input, hotelId: "b", roomTypeId: "rt-b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["abc", "1.234", "-0.01", ".5", "1..2"])("rejects malformed or negative monetary text %s at the database boundary", async price => {
    await seedHotel("a", "owner-a");
    await expect(db.insert(availability).values({ roomTypeId: "rt-a", date: "2026-11-01", price, roomsAvailable: 1 })).rejects.toThrow();
  });
});
