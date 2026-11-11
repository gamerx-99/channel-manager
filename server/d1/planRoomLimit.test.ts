import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelPaymentSettings, hotelSubscriptions, hotelUsers, hotels, roomTypes, rooms } from "../../drizzle/d1-schema";
import { user } from "../../drizzle/auth-schema";
import { createD1PublicCallerContext, type D1ScopedDatabase } from "../db/scope";
import { getPublicRoomTypeAvailability } from "./bookingService";
import { createBookingWithGuests, holdRoomType } from "./booking";
import { FREE_PLAN_ROOM_LIMIT_MESSAGE, getPlanRoomLimit, planCappedRoomIds, resolveHotelPlan } from "./planRoomLimit";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const TYPE = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-11T05:00:00.000Z");
const DAY = 86_400_000;
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const owner = { userId: "owner-1", roles: ["hotel_owner"], access: "authenticated" } as never;

async function seed(ownerCreatedAt: Date, roomCount: number) {
  await db.insert(user).values({ id: "owner-1", name: "Owner", email: "owner@example.test", emailVerified: true, createdAt: ownerCreatedAt, updatedAt: ownerCreatedAt });
  await db.insert(hotels).values({ id: HOTEL, name: "Test", slug: "test", address: "A", ownerContact: "o@example.test", publicEnabled: true, createdAt: ownerCreatedAt });
  await db.insert(hotelUsers).values({ id: "mem-owner", hotelId: HOTEL, userId: "owner-1", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(hotelPaymentSettings).values({ hotelId: HOTEL, promptpayId: "0812345678" });
  await db.insert(roomTypes).values({
    id: TYPE, hotelId: HOTEL, name: "Room", capacity: 2, basePrice: "1000.00",
    occupancyPricing: { "1": { enabled: true, mode: "fixed", value: 0 }, "2": { enabled: true, mode: "fixed", value: 0 } },
  });
  // Inserted in creation order; room numbers deliberately do not follow it.
  const numbers = ["105", "101", "104", "102", "103"].slice(0, roomCount);
  for (const [index, number] of numbers.entries()) {
    await db.insert(rooms).values({ id: `room-${index + 1}`, hotelId: HOTEL, roomTypeId: TYPE, roomNumber: number, status: "available" });
  }
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    const values = params.map(value => typeof value === "boolean" ? Number(value) : value) as never[];
    if (method === "run") { statement.run(...values); return { rows: [] }; }
    const row = method === "get" ? statement.get(...values) : statement.all(...values);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: { ...d1Schema, user } }) as unknown as D1ScopedDatabase;
  // The booking insert runs raw statements in one batch through the D1 client.
  (db as unknown as { $client: unknown }).$client = {
    prepare: (query: string) => ({ bind: (...values: unknown[]) => ({ query, values }) }),
    async batch(statements: Array<{ query: string; values: unknown[] }>) {
      return statements.map(({ query, values }) => ({ meta: { changes: Number(sqlite.prepare(query).run(...values.map(value => typeof value === "boolean" ? Number(value) : value) as never[]).changes) } }));
    },
  };
});
afterEach(() => sqlite.close());

describe("resolveHotelPlan", () => {
  it("is trial within 15 days of the owner's account, free after, Pro while paid", async () => {
    await seed(new Date(NOW.getTime() - 3 * DAY), 1);
    expect((await resolveHotelPlan(db, HOTEL, NOW)).plan).toBe("trial");
    expect((await resolveHotelPlan(db, HOTEL, new Date(NOW.getTime() + 20 * DAY))).plan).toBe("free");
    await db.insert(hotelSubscriptions).values({ hotelId: HOTEL, paidUntil: new Date(NOW.getTime() + 60 * DAY) });
    expect((await resolveHotelPlan(db, HOTEL, new Date(NOW.getTime() + 20 * DAY))).plan).toBe("pro");
  });
});

describe("Free plan: 3 rooms by creation order", () => {
  it("holds back every room after the first three created, whatever their numbers", async () => {
    await seed(new Date(NOW.getTime() - 30 * DAY), 5);
    expect(await planCappedRoomIds(db, HOTEL, NOW)).toEqual(["room-4", "room-5"]);
    await expect(getPlanRoomLimit(db, owner, HOTEL, NOW)).resolves.toEqual({ plan: "free", limit: 3, total_rooms: 5, capped_room_ids: ["room-4", "room-5"] });
  });

  it("offers only three rooms online", async () => {
    await seed(new Date(NOW.getTime() - 30 * DAY), 5);
    const counts = await getPublicRoomTypeAvailability(db, createD1PublicCallerContext(), HOTEL, "2026-12-01", "2026-12-02", NOW);
    expect(counts).toEqual([{ room_type_id: TYPE, rooms_available: 3 }]);
  });

  it("never gives a guest a held-back room, even when it has the lowest number", async () => {
    await seed(new Date(NOW.getTime() - 30 * DAY), 5);
    const picked: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const hold = await holdRoomType(db, createD1PublicCallerContext(), { slug: "test", room_type_id: TYPE, check_in: "2026-12-01", check_out: "2026-12-02", adults: 1, children: [] }, NOW);
      picked.push(hold.room_id);
    }
    expect(picked.sort()).toEqual(["room-1", "room-2", "room-3"]);
    await expect(holdRoomType(db, createD1PublicCallerContext(), { slug: "test", room_type_id: TYPE, check_in: "2026-12-01", check_out: "2026-12-02", adults: 1, children: [] }, NOW)).rejects.toBeTruthy();
  });

  it("refuses a staff booking on a held-back room and allows one on a sellable room", async () => {
    await seed(new Date(NOW.getTime() - 30 * DAY), 5);
    const booking = (roomId: string) => ({ hotel_id: HOTEL, room_id: roomId, guest_name: "Guest", check_in: "2026-12-01", check_out: "2026-12-02", price: "1000.00", source: "manual", status: "confirmed" }) as never;
    await expect(createBookingWithGuests(db, owner, booking("room-4"), [], [], NOW)).rejects.toMatchObject({ code: "FORBIDDEN", message: FREE_PLAN_ROOM_LIMIT_MESSAGE });
    await expect(createBookingWithGuests(db, owner, booking("room-1"), [], [], NOW)).resolves.toMatchObject({ room_id: "room-1" });
  });

  it("does not limit a hotel on trial or Pro", async () => {
    await seed(new Date(NOW.getTime() - 3 * DAY), 5);
    expect(await planCappedRoomIds(db, HOTEL, NOW)).toEqual([]);
    const counts = await getPublicRoomTypeAvailability(db, createD1PublicCallerContext(), HOTEL, "2026-12-01", "2026-12-02", NOW);
    expect(counts).toEqual([{ room_type_id: TYPE, rooms_available: 5 }]);
  });
});
