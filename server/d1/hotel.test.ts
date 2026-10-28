import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotelMedia, hotelServices, hotelUsers, hotels, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHotelService, createManagedHotel, createManagedRoomType, deleteHotelService, deleteManagedRoomType, getManagedHotel, getPublicHotel, listActiveHotelServicesBySlug, listHotelServices, listManagedHotels, listManagedHotelsForFinancials, updateHotelService, updateManagedRoomType } from "./hotel";

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

async function seedHotel(id: string, owner: string, role = "hotel_owner", publicEnabled = true) {
  await db.insert(hotels).values({ id, name: `Hotel ${id}`, slug: `${id}-slug`, address: "address", ownerContact: `${owner}@example.test`, publicEnabled });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: owner, role, permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: `rt-${id}`, hotelId: id, name: "Standard", capacity: 2, basePrice: "100.00" });
  await db.insert(rooms).values({ id: `room-${id}`, hotelId: id, roomTypeId: `rt-${id}`, roomNumber: "001" });
  await db.insert(bookings).values({ id: `booking-${id}`, hotelId: id, roomId: `room-${id}`, guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
  await db.insert(hotelServices).values({ id: `service-${id}`, hotelId: id, name: "Breakfast", pricingModel: "ONE_TIME", unitPrice: "20.00", isActive: true });
  await db.insert(hotelMedia).values({ id: `media-${id}`, hotelId: id, url: `media/${id}` });
}

describe("D1 hotel repository", () => {
  it("reads and mutates hotel, room, and service data within the caller's scope", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    expect(await listManagedHotels(db, caller)).toHaveLength(1);
    expect(await getManagedHotel(db, caller, "a")).toMatchObject({ id: "a", room_types: [{ id: "rt-a" }] });
    await expect(getManagedHotel(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listManagedHotelsForFinancials(db, caller)).toMatchObject([{ id: "a", bookings: [{ price: "100.00" }] }]);
    await expect(listHotelServices(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const roomType = await createManagedRoomType(db, caller, { hotel_id: "a", name: "Family", capacity: 4, base_price: 150.25, quantity: 2 });
    expect(roomType).toMatchObject({ hotelId: "a", basePrice: "150.25", capacity: 4 });
    expect((await db.select().from(rooms).where(eq(rooms.roomTypeId, roomType.id))).map(room => room.roomNumber)).toEqual(["002", "003"]);
    await expect(updateManagedRoomType(db, caller, { hotel_id: "a", room_type_id: roomType.id, child_rule: "height", child_rule_limit: 160.125 })).resolves.toMatchObject({ childRuleLimit: "160.125" });
    await expect(createManagedRoomType(db, caller, { hotel_id: "b", name: "No", capacity: 2, base_price: 120, quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateManagedRoomType(db, caller, { hotel_id: "b", room_type_id: "rt-b", name: "No", capacity: 2, base_price: 110 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateManagedRoomType(db, caller, { hotel_id: "a", room_type_id: roomType.id, name: "Family+", base_price: 160.50 })).resolves.toMatchObject({ name: "Family+", basePrice: "160.50" });
    await expect(deleteManagedRoomType(db, caller, { hotel_id: "a", room_type_id: roomType.id })).resolves.toEqual({ id: roomType.id });

    const service = await createHotelService(db, caller, { hotel_id: "a", name: "Transfer", pricing_model: "ONE_TIME", unit_price: 35.50 });
    expect(service).toMatchObject({ hotelId: "a", unitPrice: "35.50" });
    await expect(updateHotelService(db, caller, { hotel_id: "b", service_id: "service-b", name: "X", pricing_model: "ONE_TIME", unit_price: 1, is_active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelService(db, caller, { hotel_id: "a", service_id: service.id, name: "Pickup", pricing_model: "ONE_TIME", unit_price: 40, is_active: true })).resolves.toMatchObject({ name: "Pickup" });
    await expect(deleteHotelService(db, caller, { hotel_id: "a", service_id: service.id })).resolves.toEqual({ id: service.id });
  });

  it("restricts hotel creation to platform permission and public reads to published hotels", async () => {
    await seedHotel("a", "owner-a", "hotel_owner", true);
    await seedHotel("b", "owner-b", "hotel_owner", false);
    await expect(createManagedHotel(db, { userId: "owner-a" }, { name: "New", slug: "new", address: "A", owner_contact: "x", public_enabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await seedHotel("platform", "root", "super_admin");
    await expect(createManagedHotel(db, { userId: "root" }, { name: "New", slug: "new", address: "A", owner_contact: "x", public_enabled: false })).resolves.toMatchObject({ slug: "new" });

    const publicCaller = { userId: "", access: "public" as const };
    expect(await getPublicHotel(db, publicCaller, "a-slug")).toMatchObject({ hotel: { id: "a" }, roomTypes: [{ id: "rt-a" }] });
    expect(await listActiveHotelServicesBySlug(db, publicCaller, "a-slug")).toHaveLength(1);
    await expect(getPublicHotel(db, publicCaller, "b-slug")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPublicHotel(db, { userId: "owner-a" }, "a-slug")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns managed hotels newest first", async () => {
    await db.insert(hotels).values([
      { id: "older", name: "Older", slug: "older", address: "A", ownerContact: "owner@example.test", publicEnabled: false, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "newer", name: "Newer", slug: "newer", address: "A", ownerContact: "owner@example.test", publicEnabled: false, createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    await db.insert(hotelUsers).values([
      { id: "m-older", hotelId: "older", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] },
      { id: "m-newer", hotelId: "newer", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] },
    ]);
    expect((await listManagedHotels(db, { userId: "owner" })).map(hotel => hotel.id)).toEqual(["newer", "older"]);
  });
});
