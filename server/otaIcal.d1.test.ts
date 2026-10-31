import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { bookings, d1Schema, hotelUsers, hotels, otaConnections, rooms, roomTypes } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "./db/scope";
import { createWorkerApp } from "../worker/app";
import type { WorkerEnv } from "../worker/app";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types/index.ts";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  // The export drops bookings that already checked out, so pin the clock before the seeded stay.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T05:00:00.000Z") });
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
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

function fakeContext(userId: string | null) {
  return async () => ({ user: userId ? { id: userId } as any : null, clientIp: "test" });
}

const TOKEN = "ab".repeat(32);

async function seedHotel() {
  await db.insert(hotels).values({ id: "hotel-a", name: "Seaside", slug: "seaside", address: "A", ownerContact: "owner@example.test", publicEnabled: true });
  await db.insert(hotelUsers).values({ id: "m-a", hotelId: "hotel-a", userId: "owner-a", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: "rt-a", hotelId: "hotel-a", name: "Deluxe", capacity: 2, basePrice: "100.00" });
  await db.insert(rooms).values({ id: "room-a", hotelId: "hotel-a", roomTypeId: "rt-a", roomNumber: "101" });
  await db.insert(otaConnections).values({ id: "ota-a", hotelId: "hotel-a", provider: "Trip", status: "connected", roomId: "room-a", icalExportToken: TOKEN });
  await db.insert(bookings).values({ id: "b1", hotelId: "hotel-a", roomId: "room-a", guestName: "Guest", checkIn: "2026-10-29", checkOut: "2026-10-30", price: "100.00", source: "manual", status: "confirmed" });
}

describe("GET /api/ical/:file (D1)", () => {
  it("serves the room calendar for a valid token", async () => {
    await seedHotel();
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: {} as R2Bucket } as WorkerEnv;
    const res = await app.request(`/api/ical/${TOKEN}.ics`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("DTSTART;VALUE=DATE:20261029");
    expect(body).toContain("Seaside · 101");
  });

  it("returns 404 for an unknown token without leaking anything", async () => {
    await seedHotel();
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: {} as R2Bucket } as WorkerEnv;
    const unknown = "cd".repeat(32);
    const res = await app.request(`/api/ical/${unknown}.ics`, {}, env);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Calendar not found.");
  });

  it("never queries the database for a malformed token", async () => {
    const select = vi.spyOn(db, "select");
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: {} as R2Bucket } as WorkerEnv;
    const res = await app.request("/api/ical/'; drop table bookings; --.ics", {}, env);
    expect(res.status).toBe(404);
    expect(select).not.toHaveBeenCalled();
  });
});
