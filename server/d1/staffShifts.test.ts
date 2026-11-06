import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { addStaffShift, deleteStaffShift, listStaffShifts } from "./staffShifts";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>; let db: D1ScopedDatabase;
beforeEach(() => { sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON"); for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql") && !name.startsWith("20261106030000_staff_shifts")).sort()) for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement); for (const statement of readFileSync(resolve(migrationFolder, "20261106030000_staff_shifts.sql"), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement); db = sqliteProxy(async (query, params, method) => { const statement = sqlite.prepare(query); statement.setReturnArrays(true); if (method === "run") { statement.run(...params); return { rows: [] }; } if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; } return { rows: statement.all(...params) }; }, { schema: d1Schema }) as unknown as D1ScopedDatabase; });
afterEach(() => sqlite.close());
async function seedHotel(id: string) { await db.insert(hotels).values({ id, name: id, slug: id, address: "addr", ownerContact: "owner@example.test" }); await db.insert(hotelUsers).values({ id: `staff-${id}`, hotelId: id, userId: `staff-user-${id}`, role: "front_desk", fullName: "Staff Member", position: "Reception", permissionGrants: [], permissionRevokes: [] }); }
const caller = { userId: "owner-user", access: "authenticated" } as any;
describe("staff shifts D1 repository", () => {
  it("refuses another hotel's membership and scopes deletes to the requested hotel", async () => {
    await seedHotel("hotel-a"); await seedHotel("hotel-b"); await db.insert(hotelUsers).values({ id: "owner-membership", hotelId: "hotel-a", userId: "owner-user", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
    const shift = await addStaffShift(db, caller, "hotel-a", { hotel_user_id: "staff-hotel-a", date: "2026-11-01", start_time: "08:00", end_time: "17:00", break_minutes: 60 });
    await expect(addStaffShift(db, caller, "hotel-a", { hotel_user_id: "staff-hotel-b", date: "2026-11-01", start_time: "08:00", end_time: "17:00", break_minutes: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(deleteStaffShift(db, caller, "hotel-b", shift.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listStaffShifts(db, caller, "hotel-a", "2026-11")).shifts).toHaveLength(1);
  });
});
