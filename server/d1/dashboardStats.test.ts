import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotels, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { freeRoomsTonight, occupiedRoomIdsOnNight } from "./dashboardStats";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
const NOW = new Date("2026-11-05T05:00:00.000Z");

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

async function seed() {
  await db.insert(hotels).values({ id: "h", name: "H", slug: "h", address: "a", ownerContact: "o" });
  await db.insert(hotels).values({ id: "other", name: "Other", slug: "other", address: "a", ownerContact: "o" });
  await db.insert(roomTypes).values({ id: "rt", hotelId: "h", name: "Room", capacity: 2, basePrice: "100.00" });
  await db.insert(roomTypes).values({ id: "rt-other", hotelId: "other", name: "Room", capacity: 2, basePrice: "100.00" });
  for (const n of ["1", "2", "3", "4"]) await db.insert(rooms).values({ id: `r${n}`, hotelId: "h", roomTypeId: "rt", roomNumber: n });
  await db.insert(rooms).values({ id: "r-other", hotelId: "other", roomTypeId: "rt-other", roomNumber: "1" });
}

const booking = (id: string, roomId: string, status: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) =>
  ({ id, hotelId: id.startsWith("other") ? "other" : "h", roomId, guestName: "G", checkIn, checkOut, price: "100.00", source: "manual", status, ...extra }) as never;

describe("occupiedRoomIdsOnNight", () => {
  it("counts a guest who is in the room tonight, whether or not they have checked in", async () => {
    await seed();
    await db.insert(bookings).values(booking("b1", "r1", "confirmed", "2026-11-05", "2026-11-06"));
    await db.insert(bookings).values(booking("b2", "r2", "checked_in", "2026-11-03", "2026-11-07"));
    const occupied = await occupiedRoomIdsOnNight(db, "h", "2026-11-05", "2026-11-06", NOW);
    expect([...occupied].sort()).toEqual(["r1", "r2"]);
  });

  it("does not count a guest leaving today, one arriving tomorrow, or a finished or cancelled booking", async () => {
    await seed();
    await db.insert(bookings).values(booking("leaving", "r1", "checked_in", "2026-11-03", "2026-11-05"));
    await db.insert(bookings).values(booking("tomorrow", "r2", "confirmed", "2026-11-06", "2026-11-07"));
    await db.insert(bookings).values(booking("done", "r3", "checked_out", "2026-11-04", "2026-11-06"));
    await db.insert(bookings).values(booking("cancelled", "r4", "cancelled", "2026-11-05", "2026-11-06"));
    expect((await occupiedRoomIdsOnNight(db, "h", "2026-11-05", "2026-11-06", NOW)).size).toBe(0);
  });

  it("counts a live hold but not an expired one", async () => {
    await seed();
    await db.insert(bookings).values(booking("live", "r1", "held", "2026-11-05", "2026-11-06", { expiresAt: new Date(NOW.getTime() + 600_000) }));
    await db.insert(bookings).values(booking("stale", "r2", "held", "2026-11-05", "2026-11-06", { expiresAt: new Date(NOW.getTime() - 600_000) }));
    expect([...(await occupiedRoomIdsOnNight(db, "h", "2026-11-05", "2026-11-06", NOW))]).toEqual(["r1"]);
  });

  it("never counts another hotel's bookings", async () => {
    await seed();
    await db.insert(bookings).values(booking("other-1", "r-other", "confirmed", "2026-11-05", "2026-11-06"));
    expect((await occupiedRoomIdsOnNight(db, "h", "2026-11-05", "2026-11-06", NOW)).size).toBe(0);
  });
});

describe("freeRoomsTonight", () => {
  const rooms4 = [{ id: "r1", status: "available" }, { id: "r2", status: "available" }, { id: "r3", status: "maintenance" }, { id: "r4", status: "available" }];

  it("is the rooms in service minus the occupied ones (regression: it was the rooms whose status field said available, so every empty or full room counted)", () => {
    expect(freeRoomsTonight(rooms4, new Set())).toBe(3);
    expect(freeRoomsTonight(rooms4, new Set(["r1", "r2"]))).toBe(1);
    expect(freeRoomsTonight(rooms4, new Set(["r1", "r2", "r4"]))).toBe(0);
  });

  it("does not count a room in maintenance as free or as occupied twice", () => {
    expect(freeRoomsTonight(rooms4, new Set(["r3"]))).toBe(3);
  });
});
