import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, staffShifts } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createStaffTask, deleteStaffTask, listMyStaffTasks, listStaffTasks, setStaffTaskDone } from "./staffTasks";

const folder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>; let db: D1ScopedDatabase;
beforeEach(() => { sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON"); for (const file of readdirSync(folder).filter(name => name.endsWith(".sql")).sort()) for (const statement of readFileSync(resolve(folder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement); db = sqliteProxy(async (query, params, method) => { const statement = sqlite.prepare(query); statement.setReturnArrays(true); if (method === "run") { statement.run(...params); return { rows: [] }; } if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; } return { rows: statement.all(...params) }; }, { schema: d1Schema }) as unknown as D1ScopedDatabase; });
afterEach(() => sqlite.close());
async function seed(id: string, userId: string) { await db.insert(hotels).values({ id, name: id, slug: id, address: "addr", ownerContact: "owner@example.test" }); await db.insert(hotelUsers).values({ id: `member-${userId}`, hotelId: id, userId, role: "front_desk", permissionGrants: [], permissionRevokes: [] }); }
const caller = { userId: "owner-user", access: "authenticated" } as any;
describe("staff task D1 repository", () => {
  it("checks hotel scope and staff membership, then returns manager tasks", async () => {
    await seed("hotel-a", "staff-user"); await seed("hotel-b", "other-user");
    await db.insert(hotels).values({ id: "hotel-a-owner", name: "Hotel A owner", slug: "hotel-a-owner", address: "addr", ownerContact: "owner2@example.test" });
    await db.insert(hotelUsers).values({ id: "owner-member", hotelId: "hotel-a", userId: "owner-user", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
    const task = await createStaffTask(db, caller, "hotel-a", { assigned_to: "member-staff-user", task_date: "2026-11-06", title: "Check arrivals" });
    await expect(createStaffTask(db, caller, "hotel-a", { assigned_to: "member-other-user", task_date: "2026-11-06", title: "Wrong hotel" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(deleteStaffTask(db, caller, "hotel-b", task.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listStaffTasks(db, caller, "hotel-a", "2026-11-06", "2026-11-06")).toHaveLength(1);
    expect(await listMyStaffTasks(db, { userId: "staff-user", access: "authenticated" }, "hotel-a", new Date("2026-11-06T00:00:00Z"))).toMatchObject({ tasks: [{ id: task.id }], waiting_for_shift_start: false, shift_start: null });
    await db.insert(hotelUsers).values({ id: "another-member", hotelId: "hotel-a", userId: "another-user", role: "front_desk", permissionGrants: [], permissionRevokes: [] });
    expect(await listMyStaffTasks(db, { userId: "another-user", access: "authenticated" }, "hotel-a", new Date("2026-11-06T00:00:00Z"))).toMatchObject({ tasks: [], waiting_for_shift_start: false, shift_start: null });
    await expect(setStaffTaskDone(db, { userId: "another-user", access: "authenticated" }, "hotel-a", task.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the shift waiting state without exposing today's hidden tasks", async () => {
    await seed("hotel-a", "staff-user");
    await db.insert(hotelUsers).values({ id: "owner-member", hotelId: "hotel-a", userId: "owner-user", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
    await db.insert(staffShifts).values({ hotelId: "hotel-a", hotelUserId: "member-staff-user", date: "2026-11-06", startTime: "09:00", endTime: "17:00", breakMinutes: 0, createdBy: "owner-user" });
    await createStaffTask(db, caller, "hotel-a", { assigned_to: "member-staff-user", task_date: "2026-11-06", title: "Hidden task details" });
    await expect(listMyStaffTasks(db, { userId: "staff-user", access: "authenticated" }, "hotel-a", new Date("2026-11-06T00:00:00Z"))).resolves.toEqual({ tasks: [], waiting_for_shift_start: true, shift_start: "09:00" });
  });
});
