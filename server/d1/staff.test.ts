import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelAdminAuditLogs, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHotelUserAssignment, deleteHotelUserAssignment, listHotelAdminAuditLogs, listHotelOptions, listHotelStaff, listHotelUserAssignments, transferHotelAdmin, updateHotelUserAssignmentRole } from "./staff";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = { prepare: query => ({ bind: (...params) => ({ query, params }) }), batch: async statements => {
    sqlite.exec("BEGIN"); try {
      const results = statements.map(statement => { const { query, params } = statement as { query: string; params: unknown[] }; const result = sqlite.prepare(query).run(...params); return { meta: { changes: Number(result.changes) } }; });
      sqlite.exec("COMMIT"); return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
});
afterEach(() => sqlite.close());

async function seed() {
  await db.insert(hotels).values([{ id: "a", name: "A", slug: "a", address: "A", ownerContact: "a", publicEnabled: true }, { id: "b", name: "B", slug: "b", address: "B", ownerContact: "b", publicEnabled: true }]);
  await db.insert(hotelUsers).values([
    { id: "owner-a", hotelId: "a", userId: "ua", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] },
    { id: "staff-a", hotelId: "a", userId: "worker", role: "front_desk", permissionGrants: [], permissionRevokes: [] },
    { id: "owner-b", hotelId: "b", userId: "ub", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] },
    { id: "root", hotelId: "a", userId: "root", role: "super_admin", permissionGrants: [], permissionRevokes: [] },
  ]);
}

describe("D1 staff repository", () => {
  it("scopes staff management and records admin transfer atomically", async () => {
    await seed(); const owner = { userId: "ua" };
    await expect(listHotelStaff(db, owner, "a", [{ id: "worker", email: "worker@test", confirmed_at: null, last_sign_in_at: null }])).resolves.toHaveLength(2);
    await expect(listHotelStaff(db, owner, "b", [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await createHotelUserAssignment(db, owner, { hotel_id: "a", user_id: "new", role: "housekeeping" });
    expect(created).toMatchObject({ role: "housekeeping", hotels: { name: "A" } });
    await expect(createHotelUserAssignment(db, owner, { hotel_id: "a", user_id: "x", role: "support" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createHotelUserAssignment(db, owner, { hotel_id: "b", user_id: "x", role: "front_desk" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelUserAssignmentRole(db, owner, { membership_id: "staff-a", hotel_id: "a", role: "revenue_manager" })).resolves.toMatchObject({ role: "revenue_manager" });
    await expect(updateHotelUserAssignmentRole(db, owner, { membership_id: "owner-b", hotel_id: "b", role: "front_desk" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelUserAssignment(db, owner, "staff-a")).resolves.toEqual({ id: "staff-a" });
    await expect(deleteHotelUserAssignment(db, owner, "owner-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHotelUserAssignments(db, { userId: "root" })).resolves.toHaveLength(4);
    await expect(listHotelOptions(db, { userId: "root" })).resolves.toHaveLength(2);
    await expect(listHotelOptions(db, owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transferHotelAdmin(db, owner, { hotel_id: "a", target_membership_id: created.id })).resolves.toMatchObject({ role: "hotel_owner" });
    expect(await db.select({ role: hotelUsers.role }).from(hotelUsers).where((await import("drizzle-orm")).eq(hotelUsers.id, "owner-a"))).toMatchObject([{ role: "housekeeping" }]);
    expect(await db.select().from(hotelAdminAuditLogs)).toHaveLength(1);
    await expect(listHotelAdminAuditLogs(db, owner, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHotelAdminAuditLogs(db, { userId: "new" }, "a")).resolves.toHaveLength(1);
  });
});
