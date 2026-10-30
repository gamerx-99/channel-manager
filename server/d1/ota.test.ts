import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingNights, bookingStatusLog, bookings, d1Schema, hotelUsers, hotels, otaConnections, otaSyncLogs, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createD1SystemCallerContext, isD1SystemCallerContext } from "../db/scope";
import { createBookingWithGuests } from "./booking";
import { getOtaSummary, fetchAndSyncOtaConnection, getOtaIcalExport, otaConnectionRoomSameHotel, syncOtaIcalBlocks } from "./ota";
import { runScheduledD1OtaSync } from "./otaScheduler";

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
          return { meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
});
afterEach(() => sqlite.close());

const system = () => createD1SystemCallerContext();
const ownerA = { userId: "owner-a" };
const ownerB = { userId: "owner-b" };
const publicCaller = { userId: "", access: "public" as const };
const NOW = new Date("2026-10-28T05:00:00.000Z");
const feedEvent = { uid: "ota-uid-1", start: "2026-11-10", end: "2026-11-12", summary: "Reserved" };

async function seedHotel(id: string, owner: string, token = (id === "a" ? "a" : "b").repeat(64)) {
  await db.insert(hotels).values({ id, name: `Hotel ${id}`, slug: `hotel-${id}`, address: "Address", ownerContact: `${owner}@example.test` });
  await db.insert(hotelUsers).values({ id: `membership-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: `type-${id}`, hotelId: id, name: `Type ${id}`, capacity: 2, basePrice: "100.00", baseOccupancy: 2, maxOccupancy: 2, occupancyPricing: {}, childRates: {} });
  await db.insert(rooms).values({ id: `room-${id}`, hotelId: id, roomTypeId: `type-${id}`, roomNumber: "001" });
  await db.insert(otaConnections).values({ id: `ota-${id}`, hotelId: id, provider: "Trip", status: "connected", roomId: `room-${id}`, icalExportToken: token });
}

async function seedOtaBooking(id: string, uid: string, status: string, checkIn = feedEvent.start, checkOut = feedEvent.end) {
  await db.insert(bookings).values({ id, hotelId: "a", roomId: "room-a", guestName: "Trip · Reserved", checkIn, checkOut, price: "0.00", source: "ota_ical", status, otaConnectionId: "ota-a", externalUid: uid });
}

describe("D1 OTA iCal services", () => {
  it("enforces same-hotel room and room-type targets", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await expect(otaConnectionRoomSameHotel(db, ownerA, { hotel_id: "a", room_id: "room-b", room_type_id: null }, NOW)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(otaConnectionRoomSameHotel(db, ownerA, { hotel_id: "a", room_id: null, room_type_id: "type-b" }, NOW)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(otaConnectionRoomSameHotel(db, ownerA, { hotel_id: "a", room_id: "room-a", room_type_id: "type-a" }, NOW)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await otaConnectionRoomSameHotel(db, ownerA, { hotel_id: "a", room_id: "room-a", room_type_id: null }, NOW)).toBe(true);
    expect(() => sqlite.prepare("UPDATE ota_connections SET room_id = 'room-b' WHERE id = 'ota-a'").run()).toThrow(/does not belong to this hotel/);
    expect(() => sqlite.prepare("UPDATE ota_connections SET room_type_id = 'type-b' WHERE id = 'ota-a'").run()).toThrow(/does not belong to this hotel/);
  });

  it("rejects cross-hotel OTA sync before fetching or changing inventory", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await expect(syncOtaIcalBlocks(db, ownerB, "ota-a", [feedEvent], {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const fetchImpl = vi.fn();
    await expect(fetchAndSyncOtaConnection(db, ownerB, "ota-a", fetchImpl, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await db.select().from(bookings)).toEqual([]);
    expect(await db.select().from(otaSyncLogs)).toEqual([]);
  });

  it("allows only a trusted system identity or a hotel caller with the sync permission", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await expect(syncOtaIcalBlocks(db, publicCaller, "ota-a", [feedEvent], {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(syncOtaIcalBlocks(db, { userId: "system", access: "system" }, "ota-a", [feedEvent], {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(syncOtaIcalBlocks(db, { ...ownerA, access: "system" }, "ota-a", [feedEvent], {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(syncOtaIcalBlocks(db, ownerB, "ota-a", [feedEvent], {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(syncOtaIcalBlocks(db, ownerA, "ota-a", [feedEvent], {}, NOW)).resolves.toMatchObject({ inserted: 1 });
    await expect(syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW)).resolves.toMatchObject({ unchanged: 1 });
  });

  it("imports the same feed idempotently without duplicate bookings or extra sync logs", async () => {
    await seedHotel("a", "owner-a");
    const first = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    const second = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(first).toMatchObject({ inserted: 1, updated: 0, conflicts: [], skipped_uids: [] });
    expect(second).toMatchObject({ inserted: 0, unchanged: 1, conflicts: [], skipped_uids: [] });
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect((await db.select().from(bookingNights)).map(row => row.night).sort()).toEqual(["2026-11-10", "2026-11-11"]);
    expect(await db.select().from(bookingStatusLog)).toHaveLength(0);
    expect(await db.select().from(otaSyncLogs)).toHaveLength(1);
  });

  it("fetches a stored feed URL and passes the parsed calendar to sync", async () => {
    await seedHotel("a", "owner-a");
    await db.update(otaConnections).set({ icalImportUrl: "https://calendar.example.com/feed.ics" }).where(eq(otaConnections.id, "ota-a"));
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ota-uid-1\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261112\r\nEND:VEVENT\r\nEND:VCALENDAR", {
        headers: { "content-type": "text/calendar; charset=utf-8" },
      });
    });
    const result = await fetchAndSyncOtaConnection(db, system(), "ota-a", fetchImpl, NOW);
    expect(result).toMatchObject({ inserted: 1, conflicts: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it("records only a client-safe failure for a rejected stored URL", async () => {
    await seedHotel("a", "owner-a");
    await db.update(otaConnections).set({ icalImportUrl: "http://127.0.0.1/private?secret=value" }).where(eq(otaConnections.id, "ota-a"));
    const fetchImpl = vi.fn();
    await expect(fetchAndSyncOtaConnection(db, system(), "ota-a", fetchImpl, NOW)).rejects.toThrow("Could not fetch or validate the iCal calendar.");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await db.select().from(otaConnections))[0]).toMatchObject({ status: "error", lastError: "Could not fetch or validate the iCal calendar." });
    const [log] = await db.select().from(otaSyncLogs);
    expect(log?.errorMessage).toBe("Could not fetch or validate the iCal calendar.");
    expect(JSON.stringify(log)).not.toContain("127.0.0.1");
    expect(JSON.stringify(log)).not.toContain("secret=value");
  });

  it("continues scheduled sync after a failure and supplies only branded system authority", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(otaConnections).values({ id: "ota-disconnected", hotelId: "a", provider: "Other", status: "disconnected", roomId: "room-a", icalImportUrl: "https://calendar.example.com/disabled" });
    await db.update(otaConnections).set({ icalImportUrl: "https://calendar.example.com/feed" }).where(eq(otaConnections.id, "ota-a"));
    await db.update(otaConnections).set({ icalImportUrl: "https://calendar.example.com/feed" }).where(eq(otaConnections.id, "ota-b"));
    const callers: boolean[] = [];
    const processed: string[] = [];
    const summary = await runScheduledD1OtaSync(db, {
      syncConnection: async (_database, caller, connectionId) => {
        callers.push(isD1SystemCallerContext(caller));
        processed.push(connectionId);
        if (connectionId === "ota-a") throw new Error("error includes sensitive URL");
        return { inserted: 1, updated: 0, unchanged: 0, cancelled: 0, conflicts: [], skipped_uids: [] };
      },
    });
    expect(summary).toMatchObject({ total: 2, succeeded: 1, failed: 1, conflicts: 0 });
    expect(summary.failures[0]?.error).toBe("Could not fetch or validate the iCal calendar.");
    expect(processed).toEqual(["ota-a", "ota-b"]);
    expect(callers).toEqual([true, true]);
  });

  it("keeps a staff-cancelled UID cancelled, reports it as skipped, and leaves the room bookable", async () => {
    await seedHotel("a", "owner-a"); await seedOtaBooking("staff-cancelled", feedEvent.uid, "cancelled");
    await db.insert(bookingStatusLog).values({ id: "staff-audit", bookingId: "staff-cancelled", fromStatus: "confirmed", toStatus: "cancelled", changedBy: "owner-a", reason: "Guest request" });
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(result.skipped_uids).toEqual([{ uid: feedEvent.uid, booking_id: "staff-cancelled", start: feedEvent.start, end: feedEvent.end }]);
    expect(result.conflicts).toEqual([]);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect((await db.select().from(bookings))[0]?.status).toBe("cancelled");
    const directBooking = await createBookingWithGuests(db, ownerA, {
      hotel_id: "a", room_id: "room-a", guest_name: "Direct guest", check_in: feedEvent.start, check_out: feedEvent.end,
      price: "100.00", source: "manual", status: "confirmed", payment_status: "unpaid", created_at: NOW.toISOString(),
      rooms: null, guests: [], adults_count: 1,
    }, [], [], NOW);
    expect(directBooking).toMatchObject({ guest_name: "Direct guest" });
    expect(await db.select().from(bookings)).toHaveLength(2);
  });

  it("skips legacy cancelled bookings that have no status log", async () => {
    await seedHotel("a", "owner-a"); await seedOtaBooking("legacy-cancelled", feedEvent.uid, "cancelled");
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(result.skipped_uids).toEqual([{ uid: feedEvent.uid, booking_id: "legacy-cancelled", start: feedEvent.start, end: feedEvent.end }]);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(otaSyncLogs)).toHaveLength(1);
    expect((await db.select().from(otaSyncLogs))[0]?.response).toMatchObject({ skippedUids: [{ uid: feedEvent.uid }] });
  });

  it("cancels a removed block and revives it only after the same UID returns", async () => {
    await seedHotel("a", "owner-a"); await seedOtaBooking("revive-me", feedEvent.uid, "confirmed");
    await db.insert(bookingNights).values([
      { roomId: "room-a", night: "2026-11-10", bookingId: "revive-me" },
      { roomId: "room-a", night: "2026-11-11", bookingId: "revive-me" },
    ]);
    const removed = await syncOtaIcalBlocks(db, system(), "ota-a", [], {}, NOW);
    expect(removed.cancelled).toBe(1);
    expect((await db.select().from(bookings))[0]?.status).toBe("cancelled");
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "revive-me"))).toEqual([]);
    const restored = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(restored).toMatchObject({ updated: 1, conflicts: [], skipped_uids: [] });
    expect((await db.select().from(bookings))[0]?.status).toBe("confirmed");
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, "revive-me"))).map(row => row.night).sort()).toEqual(["2026-11-10", "2026-11-11"]);
    expect((await db.select().from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, "revive-me")))
      .map(row => ({ to: row.toStatus, changedBy: row.changedBy, reason: row.reason }))).toEqual([
        { to: "cancelled", changedBy: null, reason: "ota_ical_removed_from_feed" },
        { to: "confirmed", changedBy: null, reason: "ota_ical_restored" },
      ]);
  });

  it("frees an OTA-removed block for a direct booking on the same dates", async () => {
    await seedHotel("a", "owner-a");
    await expect(syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW)).resolves.toMatchObject({ inserted: 1 });
    await expect(syncOtaIcalBlocks(db, system(), "ota-a", [], {}, NOW)).resolves.toMatchObject({ cancelled: 1 });
    expect(await db.select().from(bookingNights)).toEqual([]);
    await expect(createBookingWithGuests(db, ownerA, {
      hotel_id: "a", room_id: "room-a", guest_name: "Direct guest", check_in: feedEvent.start, check_out: feedEvent.end,
      price: "100.00", source: "manual", status: "confirmed", payment_status: "unpaid", created_at: NOW.toISOString(),
      rooms: null, guests: [], adults_count: 1,
    }, [], [], NOW)).resolves.toMatchObject({ guest_name: "Direct guest" });
  });

  it("does not touch checked-in or checked-out OTA bookings", async () => {
    await seedHotel("a", "owner-a");
    await seedOtaBooking("checked-in", "checked-in-uid", "checked_in");
    await seedOtaBooking("checked-out", "checked-out-uid", "checked_out");
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [], {}, NOW);
    expect(result.cancelled).toBe(0);
    expect((await db.select().from(bookings)).map(row => row.status)).toEqual(["checked_in", "checked_out"]);
    expect(await db.select().from(bookingStatusLog)).toHaveLength(0);
  });

  it("reports direct-booking overlaps as conflicts instead of inserting OTA blocks", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(bookings).values({ id: "direct", hotelId: "a", roomId: "room-a", guestName: "Direct", checkIn: feedEvent.start, checkOut: feedEvent.end, price: "100.00", source: "manual", status: "confirmed" });
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(result.conflicts).toEqual([{ uid: feedEvent.uid, start: feedEvent.start, end: feedEvent.end }]);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(otaSyncLogs)).toHaveLength(1);
  });

  it("turns a booking_nights unique clash into an OTA conflict instead of throwing", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(bookings).values({ id: "stale-night-owner", hotelId: "a", roomId: "room-a", guestName: "Old", checkIn: feedEvent.start, checkOut: feedEvent.end, price: "100.00", source: "manual", status: "cancelled" });
    await db.insert(bookingNights).values({ roomId: "room-a", night: feedEvent.start, bookingId: "stale-night-owner" });
    await expect(syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW)).resolves.toMatchObject({
      inserted: 0, conflicts: [{ uid: feedEvent.uid, start: feedEvent.start, end: feedEvent.end }],
    });
    expect((await db.select().from(bookings)).some(row => row.otaConnectionId === "ota-a")).toBe(false);
  });

  it("places room-type blocks on available rooms, retries another candidate, and conflicts when full", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(rooms).values({ id: "room-a-2", hotelId: "a", roomTypeId: "type-a", roomNumber: "002" });
    await db.update(otaConnections).set({ roomId: null, roomTypeId: "type-a" }).where(eq(otaConnections.id, "ota-a"));
    await db.insert(bookings).values({ id: "direct-one", hotelId: "a", roomId: "room-a", guestName: "Direct one", checkIn: feedEvent.start, checkOut: feedEvent.end, price: "100.00", source: "manual", status: "confirmed" });
    expect(await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW)).toMatchObject({ inserted: 1, conflicts: [] });
    const original = (await db.select().from(bookings).where(eq(bookings.externalUid, feedEvent.uid)))[0]!;
    expect(original.roomId).toBe("room-a-2");
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, original.id))).map(row => row.night).sort())
      .toEqual(["2026-11-10", "2026-11-11"]);

    await db.insert(bookings).values({ id: "direct-two", hotelId: "a", roomId: "room-a-2", guestName: "Direct two", checkIn: "2026-11-15", checkOut: "2026-11-16", price: "100.00", source: "manual", status: "confirmed" });
    const moved = { ...feedEvent, start: "2026-11-15", end: "2026-11-16" };
    expect(await syncOtaIcalBlocks(db, system(), "ota-a", [moved], {}, NOW)).toMatchObject({ updated: 1, conflicts: [] });
    const movedBooking = (await db.select().from(bookings).where(eq(bookings.externalUid, feedEvent.uid)))[0]!;
    expect(movedBooking.roomId).toBe("room-a");
    expect((await db.select().from(bookingNights).where(eq(bookingNights.bookingId, movedBooking.id))).map(row => `${row.roomId}|${row.night}`).sort())
      .toEqual(["room-a|2026-11-15"]);

    const full = await syncOtaIcalBlocks(db, system(), "ota-a", [{ ...moved, uid: "another-uid" }], {}, NOW);
    expect(full.conflicts).toEqual([{ uid: "another-uid", start: moved.start, end: moved.end }]);
  });

  it("exports opaque room events with a hotel-scoped token and no guest PII", async () => {
    await seedHotel("a", "owner-a"); await seedHotel("b", "owner-b");
    await db.insert(bookings).values({ id: "booking-a", hotelId: "a", roomId: "room-a", guestName: "Alice Private Name", checkIn: "2026-11-20", checkOut: "2026-11-22", price: "100.00", source: "manual", status: "confirmed" });
    await db.insert(bookings).values({ id: "booking-b", hotelId: "b", roomId: "room-b", guestName: "Bob Private Name", checkIn: "2026-11-21", checkOut: "2026-11-23", price: "100.00", source: "manual", status: "confirmed" });
    const feed = await getOtaIcalExport(db, publicCaller, "a".repeat(64), NOW);
    expect(feed).toContain("UID:booking-a@channel-manager");
    expect(feed).not.toContain("booking-b");
    expect(feed).not.toContain("Alice Private Name");
    expect(feed).not.toContain("Bob Private Name");
    expect(feed).toMatch(/\r\n$/);
    expect(feed!.split("\r\n").filter(Boolean).every(line => new TextEncoder().encode(line).length <= 75 || line.startsWith(" "))).toBe(true);
    expect(await getOtaIcalExport(db, publicCaller, "b".repeat(64), NOW)).not.toContain("booking-a");
    expect(await getOtaIcalExport(db, publicCaller, "not-a-token", NOW)).toBeNull();
    await expect(getOtaIcalExport(db, { userId: "system", access: "system" }, "a".repeat(64), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exports room-type dates only when every non-maintenance room is occupied", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(rooms).values({ id: "room-a-2", hotelId: "a", roomTypeId: "type-a", roomNumber: "002" });
    await db.update(otaConnections).set({ roomId: null, roomTypeId: "type-a" }).where(eq(otaConnections.id, "ota-a"));
    await db.insert(bookings).values({ id: "room-one", hotelId: "a", roomId: "room-a", guestName: "P1", checkIn: "2026-11-20", checkOut: "2026-11-22", price: "100.00", source: "manual", status: "confirmed" });
    const partial = await getOtaIcalExport(db, publicCaller, "a".repeat(64), NOW);
    expect(partial).not.toContain("20261120");
    await db.insert(bookings).values({ id: "room-two", hotelId: "a", roomId: "room-a-2", guestName: "P2", checkIn: "2026-11-20", checkOut: "2026-11-21", price: "100.00", source: "manual", status: "confirmed" });
    const full = await getOtaIcalExport(db, publicCaller, "a".repeat(64), NOW);
    expect(full).toContain("DTSTART;VALUE=DATE:20261120");
    expect(full).toContain("DTEND;VALUE=DATE:20261121");
    expect(full).not.toContain("P1");
  });

  it("keeps booking_nights unchanged and reports conflict when all candidate rooms are blocked for an OTA update", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(rooms).values({ id: "room-a-2", hotelId: "a", roomTypeId: "type-a", roomNumber: "002" });
    await db.update(otaConnections).set({ roomId: null, roomTypeId: "type-a" }).where(eq(otaConnections.id, "ota-a"));

    const initial = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(initial).toMatchObject({ inserted: 1, conflicts: [] });
    const [booking] = await db.select().from(bookings).where(eq(bookings.externalUid, feedEvent.uid));
    expect(booking).toBeDefined();
    const initialNights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id));
    expect(initialNights.map(r => r.night).sort()).toEqual(["2026-11-10", "2026-11-11"]);

    await db.insert(bookings).values([
      { id: "direct-block-1", hotelId: "a", roomId: "room-a", guestName: "Block 1", checkIn: "2026-11-15", checkOut: "2026-11-17", price: "100.00", source: "manual", status: "confirmed" },
      { id: "direct-block-2", hotelId: "a", roomId: "room-a-2", guestName: "Block 2", checkIn: "2026-11-15", checkOut: "2026-11-17", price: "100.00", source: "manual", status: "confirmed" },
    ]);

    const moved = { ...feedEvent, start: "2026-11-15", end: "2026-11-17" };
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [moved], {}, NOW);
    expect(result.conflicts).toEqual([{ uid: feedEvent.uid, start: "2026-11-15", end: "2026-11-17" }]);

    const [after] = await db.select().from(bookings).where(eq(bookings.id, booking!.id));
    expect(after?.checkIn).toBe("2026-11-10");
    expect(after?.checkOut).toBe("2026-11-12");
    expect(after?.status).toBe("confirmed");

    const preservedNights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id));
    expect(preservedNights.map(r => r.night).sort()).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("applies date move to 2nd candidate room when 1st candidate room is blocked, swapping booking_nights", async () => {
    await seedHotel("a", "owner-a");
    await db.insert(rooms).values({ id: "room-a-2", hotelId: "a", roomTypeId: "type-a", roomNumber: "002" });
    await db.update(otaConnections).set({ roomId: null, roomTypeId: "type-a" }).where(eq(otaConnections.id, "ota-a"));

    await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    const [booking] = await db.select().from(bookings).where(eq(bookings.externalUid, feedEvent.uid));
    expect(booking?.roomId).toBe("room-a");

    await db.insert(bookings).values({
      id: "block-room-a", hotelId: "a", roomId: "room-a", guestName: "Blocker", checkIn: "2026-11-15", checkOut: "2026-11-17", price: "100.00", source: "manual", status: "confirmed",
    });

    const moved = { ...feedEvent, start: "2026-11-15", end: "2026-11-17" };
    const result = await syncOtaIcalBlocks(db, system(), "ota-a", [moved], {}, NOW);
    expect(result).toMatchObject({ updated: 1, conflicts: [] });

    const [updatedBooking] = await db.select().from(bookings).where(eq(bookings.id, booking!.id));
    expect(updatedBooking?.roomId).toBe("room-a-2");
    expect(updatedBooking?.checkIn).toBe("2026-11-15");
    expect(updatedBooking?.checkOut).toBe("2026-11-17");

    const nights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id));
    expect(nights.map(r => `${r.roomId}|${r.night}`).sort()).toEqual([
      "room-a-2|2026-11-15",
      "room-a-2|2026-11-16",
    ]);
  });

  it("keeps the same booking_nights when an OTA booking is updated with unchanged dates and room", async () => {
    await seedHotel("a", "owner-a");
    await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    const [booking] = await db.select().from(bookings).where(eq(bookings.externalUid, feedEvent.uid));
    expect(booking).toBeDefined();

    // 1. Resyncing unchanged dates/room preserves nights
    const resync = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(resync).toMatchObject({ unchanged: 1, conflicts: [] });
    const nights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id));
    expect(nights.map(r => `${r.roomId}|${r.night}`).sort()).toEqual([
      "room-a|2026-11-10",
      "room-a|2026-11-11",
    ]);

    // 2. Reviving a removed block with the same dates and room reconstructs the same nights
    await syncOtaIcalBlocks(db, system(), "ota-a", [], {}, NOW);
    expect(await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id))).toEqual([]);
    const restored = await syncOtaIcalBlocks(db, system(), "ota-a", [feedEvent], {}, NOW);
    expect(restored).toMatchObject({ updated: 1, conflicts: [] });
    const restoredNights = await db.select().from(bookingNights).where(eq(bookingNights.bookingId, booking!.id));
    expect(restoredNights.map(r => `${r.roomId}|${r.night}`).sort()).toEqual([
      "room-a|2026-11-10",
      "room-a|2026-11-11",
    ]);
  });
});


describe('scheduled OTA selection and summary', () => {
  it('handles an empty connection list without invoking sync', async () => {
    const syncConnection = vi.fn();
    await expect(runScheduledD1OtaSync(db, { syncConnection })).resolves.toEqual({ total: 0, succeeded: 0, failed: 0, conflicts: 0, failures: [] });
    expect(syncConnection).not.toHaveBeenCalled();
  });
  it('syncs mapped active room and room-type feeds and counts conflicts', async () => {
    await seedHotel('a', 'owner-a');
    await db.insert(otaConnections).values([
      { id: 'room-feed', hotelId: 'a', provider: 'Room', status: 'connected', roomId: 'room-a', icalImportUrl: 'https://calendar.example.com/room' },
      { id: 'type-feed', hotelId: 'a', provider: 'Type', status: 'connected', roomTypeId: 'type-a', icalImportUrl: 'https://calendar.example.com/type' },
      { id: 'disabled', hotelId: 'a', provider: 'Disabled', status: 'disconnected', roomId: 'room-a', icalImportUrl: 'https://calendar.example.com/disabled' },
    ]);
    const processed: string[] = [];
    const summary = await runScheduledD1OtaSync(db, { syncConnection: async (_db, caller, id) => {
      expect(isD1SystemCallerContext(caller)).toBe(true);
      processed.push(id);
      return { inserted: 0, updated: 0, unchanged: 0, cancelled: 0, skipped_uids: [], conflicts: [{ uid: id, start: '2026-11-01', end: '2026-11-02' }] };
    } });
    expect(processed.sort()).toEqual(['room-feed', 'type-feed']);
    expect(summary).toEqual({ total: 2, succeeded: 2, failed: 0, conflicts: 2, failures: [] });
  });
});


describe('OTA summary port', () => {
  it('scopes OTA summary to memberships and rejects anonymous access', async () => {
    await seedHotel('a', 'owner-a'); await seedHotel('b', 'owner-b');
    await expect(getOtaSummary(db, publicCaller)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getOtaSummary(db, { userId: 'unassigned' })).resolves.toEqual([]);
    await expect(getOtaSummary(db, ownerA)).resolves.toMatchObject([{ id: 'ota-a', hotel_id: 'a' }]);
    expect(await getOtaSummary(db, ownerA)).toHaveLength(1);
  });
});
