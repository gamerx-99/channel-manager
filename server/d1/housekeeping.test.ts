import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, housekeepingTasks, hotelUsers, hotels, rooms, roomTypes } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHousekeepingTask, listHousekeepingTasks, updateHousekeepingTask, updateHousekeepingTaskStatus } from "./housekeeping";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let beforeHousekeepingUpdate: (() => void) | null;

beforeEach(() => {
  beforeHousekeepingUpdate = null;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, name), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    if (query.toLowerCase().includes("update") && query.includes("housekeeping_tasks") && beforeHousekeepingUpdate) {
      beforeHousekeepingUpdate();
      beforeHousekeepingUpdate = null;
    }
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
});

afterEach(() => sqlite.close());

async function seedHotel(id: string, owner: string, staff?: string) {
  await db.insert(hotels).values({ id, name: id, slug: id, address: "address", ownerContact: `${owner}@example.test` });
  await db.insert(hotelUsers).values({ id: `m-${owner}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  if (staff) await db.insert(hotelUsers).values({ id: `m-${staff}`, hotelId: id, userId: staff, role: "housekeeping", permissionGrants: [], permissionRevokes: [] });
  await db.insert(roomTypes).values({ id: `rt-${id}`, hotelId: id, name: "Room", capacity: 2, basePrice: "100.00" });
  await db.insert(rooms).values({ id: `room-${id}`, hotelId: id, roomTypeId: `rt-${id}`, roomNumber: "001" });
  await db.insert(bookings).values({ id: `booking-${id}`, hotelId: id, roomId: `room-${id}`, guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
}

describe("D1 housekeeping repository", () => {
  it("creates, lists, updates and validates assignees inside the hotel scope", async () => {
    await seedHotel("a", "owner-a", "staff-a");
    await seedHotel("b", "owner-b", "staff-b");
    const caller = { userId: "owner-a" };
    const created = await createHousekeepingTask(db, caller, "a", {
      room_id: "room-a", booking_id: "booking-a", assigned_to: "staff-a",
    });
    expect(created).toMatchObject({ roomId: "room-a", bookingId: "booking-a", assignedTo: "staff-a", dueDate: "2026-11-02", status: "pending" });
    expect(await listHousekeepingTasks(db, caller, "a")).toHaveLength(1);
    await expect(updateHousekeepingTaskStatus(db, caller, "a", { task_id: created.id, status: "done" }))
      .resolves.toMatchObject({ status: "done" });
    await expect(updateHousekeepingTask(db, caller, "a", created.id, {
      room_id: "room-a", booking_id: null, assigned_to: null, due_date: "2026-11-03", status: "pending",
    })).resolves.toMatchObject({ dueDate: "2026-11-03", bookingId: null, assignedTo: null });

    await expect(listHousekeepingTasks(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createHousekeepingTask(db, caller, "b", { room_id: "room-b", due_date: "2026-11-02" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHousekeepingTaskStatus(db, caller, "b", { task_id: created.id, status: "done" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHousekeepingTask(db, caller, "b", created.id, { room_id: "room-b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createHousekeepingTask(db, caller, "a", { room_id: "room-a", assigned_to: "staff-b", due_date: "2026-11-03" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createHousekeepingTask(db, caller, "a", { room_id: "room-a", booking_id: "booking-b", due_date: "2026-11-05" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a booking from another hotel and requires a due date when unlinked", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await expect(createHousekeepingTask(db, { userId: "owner-a" }, "a", { room_id: "room-a", booking_id: "booking-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createHousekeepingTask(db, { userId: "owner-a" }, "a", { room_id: "room-a", booking_id: "booking-b", due_date: "2026-11-02" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createHousekeepingTask(db, { userId: "owner-a" }, "a", { room_id: "room-a" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await updateHousekeepingTaskStatus(db, { userId: "owner-a" }, "a", { task_id: "missing", status: "done" })).toBeNull();
  });

  it("keeps the hotel predicate on the update if a task's room changes after authorization", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const task = await createHousekeepingTask(db, { userId: "owner-a" }, "a", { room_id: "room-a", due_date: "2026-11-03" });
    beforeHousekeepingUpdate = () => sqlite.exec("update rooms set hotel_id = 'b', room_number = '002' where id = 'room-a'");
    expect(await updateHousekeepingTaskStatus(db, { userId: "owner-a" }, "a", { task_id: task.id, status: "done" })).toBeNull();
    expect((await db.select().from(housekeepingTasks).where(eq(housekeepingTasks.id, task.id)))[0].status).toBe("pending");
  });
});
