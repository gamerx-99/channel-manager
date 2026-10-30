import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotelUsers, hotels, rooms, roomTypes, supportAccessGrants } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { listManagedHotelsForFinancials } from "./hotel";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(async () => {
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

  for (const id of ["a", "b"]) {
    await db.insert(hotels).values({ id: `hotel-${id}`, name: id, slug: id, address: "A", ownerContact: "owner@example.test", publicEnabled: true });
    await db.insert(roomTypes).values({ id: `rt-${id}`, hotelId: `hotel-${id}`, name: "Deluxe", capacity: 2, basePrice: "100.00" });
    await db.insert(rooms).values({ id: `room-${id}`, hotelId: `hotel-${id}`, roomTypeId: `rt-${id}`, roomNumber: "101" });
    await db.insert(bookings).values({ id: `booking-${id}`, hotelId: `hotel-${id}`, roomId: `room-${id}`, guestName: "Guest", checkIn: "2026-10-29", checkOut: "2026-10-30", price: "100.00", source: "manual", status: "confirmed" });
  }
});

afterEach(() => sqlite.close());

function member(hotelId: string, role: string, grants: string[] = [], revokes: string[] = []) {
  return db.insert(hotelUsers).values({ id: `${hotelId}-${role}`, hotelId, userId: "user-1", role, permissionGrants: grants, permissionRevokes: revokes } as any);
}

const callerAs = (role: string) => ({ userId: "user-1", roles: [role], access: "authenticated" }) as any;
const hotelIds = (rows: { id: string }[]) => rows.map(row => row.id);

describe("listManagedHotelsForFinancials", () => {
  it("returns only the hotels where the owner switched the report on for this person", async () => {
    await member("hotel-a", "revenue_manager", ["property.view_financials"]);
    await member("hotel-b", "revenue_manager");

    const rows = await listManagedHotelsForFinancials(db, callerAs("revenue_manager"));

    expect(hotelIds(rows)).toEqual(["hotel-a"]);
    expect(rows[0].bookings.map(booking => booking.id)).toEqual(["booking-a"]);
  });

  it("returns nothing for staff without the switch, including after the owner turns it off", async () => {
    await member("hotel-a", "front_desk", [], ["property.view_financials"]);

    await expect(listManagedHotelsForFinancials(db, callerAs("front_desk"))).resolves.toEqual([]);
  });

  it("still returns every hotel the caller owns", async () => {
    await member("hotel-a", "hotel_owner");
    await member("hotel-b", "hotel_owner");

    const rows = await listManagedHotelsForFinancials(db, callerAs("hotel_owner"));

    expect(hotelIds(rows).sort()).toEqual(["hotel-a", "hotel-b"]);
  });

  it("refuses support even with an active key", async () => {
    await member("hotel-a", "support");
    await db.insert(supportAccessGrants).values({ hotelId: "hotel-a", supportUserId: "user-1", grantedBy: "owner", mode: "view", createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });

    await expect(listManagedHotelsForFinancials(db, callerAs("support"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses super_admin, even with a stored owner membership", async () => {
    await member("hotel-a", "hotel_owner");

    await expect(listManagedHotelsForFinancials(db, callerAs("super_admin"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
