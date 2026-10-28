import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";
import { bookingStatusLog, bookings, d1Schema, guests, hotelUsers, hotels, otaConnections, roomTypes, rooms, supportAccessGrants, supportAccessLog } from "../../drizzle/d1-schema";
import {
  cancelHotelBooking,
  getHotelBookingValueSatang,
  listBookingGuests,
  listHotelBookings,
  listPlatformHotelSummaries,
  updateHotelStaffPermissions,
  type D1ScopedDatabase,
} from "./scope";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: DatabaseSync;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    const contents = readFileSync(resolve(migrationFolder, name), "utf8");
    for (const statement of contents.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  const proxy = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }
    if (method === "get") {
      const row = statement.get(...params);
      return { rows: row ? [row] : [] };
    }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema });
  const testDb = proxy as unknown as D1ScopedDatabase;
  testDb.$client = {
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
  db = testDb;
});

afterEach(() => sqlite.close());

async function seedHotel(id: string) {
  await db.insert(hotels).values({
    id,
    name: `Hotel ${id}`,
    slug: `hotel-${id}`,
    address: `Private address ${id}`,
    ownerContact: `owner-${id}@example.test`,
  });
}

async function seedMembership(input: {
  id?: string;
  hotelId: string;
  userId: string;
  role: string;
  grants?: string[];
  revokes?: string[];
}) {
  await db.insert(hotelUsers).values({
    id: input.id ?? `membership-${input.userId}-${input.hotelId}`,
    hotelId: input.hotelId,
    userId: input.userId,
    role: input.role,
    permissionGrants: input.grants ?? [],
    permissionRevokes: input.revokes ?? [],
  });
}

async function seedBooking(id: string, hotelId: string, price = "100.25") {
  await db.insert(bookings).values({
    id,
    hotelId,
    guestName: `Guest ${id}`,
    checkIn: "2026-11-01",
    checkOut: "2026-11-02",
    price: Number(price),
    source: "manual",
    status: "confirmed",
  });
}

async function seedSupportGrant(input: {
  id: string;
  hotelId: string;
  supportUserId: string;
  mode: "view" | "edit";
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}) {
  await db.insert(supportAccessGrants).values({
    id: input.id,
    hotelId: input.hotelId,
    supportUserId: input.supportUserId,
    grantedBy: "owner-1",
    mode: input.mode,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    revokedAt: input.revokedAt ?? null,
  });
}

const fixedNow = new Date("2026-10-28T00:00:00.000Z");

describe("D1 hotel scope and authorization", () => {
  it("keeps reads and writes inside the caller's hotel", async () => {
    await seedHotel("a");
    await seedHotel("b");
    await seedMembership({ hotelId: "a", userId: "owner-a", role: "hotel_owner" });
    await seedMembership({ hotelId: "b", userId: "owner-b", role: "hotel_owner" });
    await seedBooking("booking-a", "a");
    await seedBooking("booking-b", "b");
    await db.update(bookings).set({ status: "checked_in" }).where(eq(bookings.id, "booking-a"));
    const caller = { userId: "owner-a" };

    expect((await listHotelBookings(db, caller, "a", fixedNow)).map(row => row.id)).toEqual(["booking-a"]);
    await expect(listHotelBookings(db, caller, "b", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelHotelBooking(db, caller, "b", "booking-b", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(bookings).where(eq(bookings.id, "booking-b")))[0].status).toBe("confirmed");
    await expect(cancelHotelBooking(db, caller, "a", "booking-a", fixedNow, "guest request")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, "booking-a")))).toHaveLength(0);
    await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, "booking-a"));
    await expect(cancelHotelBooking(db, caller, "a", "booking-a", fixedNow, "guest request")).resolves.toEqual({ id: "booking-a" });
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, "booking-a"))).map(row => [row.fromStatus, row.toStatus, row.reason])).toEqual([["confirmed", "cancelled", "guest request"]]);
  });

  it("rolls back cancellation if its audit row cannot be written", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "owner-a", role: "hotel_owner" });
    await seedBooking("booking-a", "a");
    sqlite.exec(`create trigger fail_booking_audit before insert on booking_status_log
      begin select raise(abort, 'audit unavailable'); end`);
    await expect(cancelHotelBooking(db, { userId: "owner-a" }, "a", "booking-a", fixedNow))
      .rejects.toThrow("audit unavailable");
    expect((await db.select().from(bookings).where(eq(bookings.id, "booking-a")))[0].status).toBe("confirmed");
  });

  it("denies a staff member after the booking-view toggle is revoked", async () => {
    await seedHotel("a");
    await seedMembership({
      hotelId: "a", userId: "front-desk", role: "front_desk", revokes: ["operations.view_bookings"],
    });
    await seedBooking("booking-a", "a");
    await expect(listHotelBookings(db, { userId: "front-desk" }, "a", fixedNow))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies super admins hotel bookings, guest PII, and financial data", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "root", role: "super_admin" });
    await seedBooking("booking-a", "a");
    await db.insert(guests).values({
      id: "guest-a", bookingId: "booking-a", firstName: "A", lastName: "Guest", passportNo: "SECRET",
      nationalityCode: "THA", birthDate: "1990-01-01",
    });
    const caller = { userId: "root", roles: ["super_admin"] as const };
    await expect(listHotelBookings(db, caller, "a", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBookingGuests(db, caller, "a", "booking-a", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getHotelBookingValueSatang(db, caller, "a", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns guest details to a member with the guest-management permission", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "owner-a", role: "hotel_owner" });
    await seedBooking("booking-a", "a");
    await db.insert(guests).values({
      id: "guest-a", bookingId: "booking-a", firstName: "A", lastName: "Guest", passportNo: "P123",
      nationalityCode: "THA", birthDate: "1990-01-01",
    });

    await expect(listBookingGuests(db, { userId: "owner-a" }, "a", "booking-a", fixedNow))
      .resolves.toMatchObject([{ firstName: "A", passportNo: "P123" }]);
  });

  it("requires active support grants, enforces view/edit mode, and audits support access", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "owner-1", role: "hotel_owner" });
    await seedBooking("booking-a", "a");
    const caller = { userId: "support-1", roles: ["support"] as const };

    await expect(listHotelBookings(db, caller, "a", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(supportAccessLog).where(eq(supportAccessLog.supportUserId, "support-1")))[0])
      .toMatchObject({ grantId: null, action: "denied:bookings.read" });
    await seedSupportGrant({
      id: "view-grant", hotelId: "a", supportUserId: "support-1", mode: "view",
      createdAt: fixedNow, expiresAt: new Date(fixedNow.getTime() + 60 * 60 * 1000),
    });
    expect((await listHotelBookings(db, caller, "a", fixedNow)).map(row => row.id)).toEqual(["booking-a"]);
    expect(await getHotelBookingValueSatang(db, caller, "a", fixedNow)).toBe(BigInt(10025));
    await expect(cancelHotelBooking(db, caller, "a", "booking-a", fixedNow)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(supportAccessLog).where(eq(supportAccessLog.supportUserId, "support-1"))).map(row => row.action))
      .toEqual(["denied:bookings.read", "bookings.read", "financials.read", "bookings.cancel"]);

    await expect(listHotelBookings(db, caller, "a", new Date(fixedNow.getTime() + 2 * 60 * 60 * 1000)))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(supportAccessLog).where(eq(supportAccessLog.supportUserId, "support-1"))).map(row => row.action))
      .toContain("denied:bookings.read");

    await db.update(supportAccessGrants).set({ revokedAt: fixedNow }).where(eq(supportAccessGrants.id, "view-grant"));
    await seedSupportGrant({
      id: "edit-grant", hotelId: "a", supportUserId: "support-1", mode: "edit",
      createdAt: fixedNow, expiresAt: new Date(fixedNow.getTime() + 60 * 60 * 1000),
    });
    await expect(cancelHotelBooking(db, caller, "a", "booking-a", fixedNow)).resolves.toEqual({ id: "booking-a" });
    await expect(updateHotelStaffPermissions(db, caller, "a", "owner-1", [], fixedNow))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow anyone to change their own permissions", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "staff-1", role: "front_desk", grants: ["property.manage_staff"] });
    const caller = { userId: "staff-1" };
    await expect(updateHotelStaffPermissions(
      db, caller, "a", "staff-1", ["property.view", "property.manage_staff"], fixedNow,
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an owner update another staff member's permissions", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "owner-a", role: "hotel_owner" });
    await seedMembership({ hotelId: "a", userId: "target", role: "front_desk" });
    const next = [...resolveMembershipPermissions("front_desk"), "revenue.manage_rates"] as const;

    await expect(updateHotelStaffPermissions(db, { userId: "owner-a" }, "a", "target", next, fixedNow))
      .resolves.toMatchObject({ grants: ["revenue.manage_rates"] });
    expect((await db.select().from(hotelUsers).where(and(
      eq(hotelUsers.hotelId, "a"), eq(hotelUsers.userId, "target"),
    )))[0].permissionGrants).toContain("revenue.manage_rates");
  });

  it.each(["property.view_financials", "property.manage_staff"] as const)(
    "prevents non-owners from granting %s",
    async permission => {
      await seedHotel("a");
      await seedMembership({ hotelId: "a", userId: "staff-manager", role: "front_desk", grants: ["property.manage_staff"] });
      await seedMembership({ hotelId: "a", userId: "target", role: "front_desk" });
      const targetPermissions = resolveMembershipPermissions("front_desk");
      await expect(updateHotelStaffPermissions(
        db, { userId: "staff-manager" }, "a", "target", [...targetPermissions, permission], fixedNow,
      )).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("limits super-admin results to the platform summary fields", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "root", role: "super_admin" });
    await db.insert(roomTypes).values({ id: "type-a", hotelId: "a", name: "Deluxe", capacity: 2, basePrice: 100 });
    await db.insert(rooms).values({ id: "room-a", hotelId: "a", roomTypeId: "type-a", roomNumber: "101" });
    await db.insert(otaConnections).values({ id: "ota-a", hotelId: "a", provider: "Trip", status: "connected" });

    const summaries = await listPlatformHotelSummaries(db, { userId: "root", roles: ["super_admin"] });
    expect(summaries).toEqual([{
      hotelName: "Hotel a", plan: null, paymentStatus: null, roomCount: 1, syncStatus: "connected",
    }]);
    expect(Object.keys(summaries[0]).sort()).toEqual(["hotelName", "paymentStatus", "plan", "roomCount", "syncStatus"]);
  });

  it("calculates hotel booking value in exact integer satang", async () => {
    await seedHotel("a");
    await seedMembership({ hotelId: "a", userId: "owner-a", role: "hotel_owner" });
    await seedBooking("booking-a", "a", "0.10");
    await seedBooking("booking-b", "a", "0.20");
    expect(await getHotelBookingValueSatang(db, { userId: "owner-a" }, "a", fixedNow)).toBe(BigInt(30));
  });
});
