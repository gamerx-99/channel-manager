import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, notifications } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { insertNotification, listAllNotifications, listNotifications, markAllNotificationsRead, markNotificationRead, markSystemNotificationsRead } from "./notification";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, name), "utf8");
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

afterEach(() => sqlite.close());

async function seedHotel(id: string, userId: string, role = "hotel_owner") {
  await db.insert(hotels).values({ id, name: id, slug: id, address: "address", ownerContact: `${userId}@example.test` });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId, role, permissionGrants: [], permissionRevokes: [] });
}

async function seedNotification(id: string, hotelId: string) {
  await db.insert(notifications).values({ id, hotelId, type: "booking", message: id });
}

describe("D1 notifications repository", () => {
  it("lists, marks and creates notifications only inside the caller's hotel", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await seedNotification("n-a", "a");
    await seedNotification("n-b", "b");
    const caller = { userId: "owner-a" };

    expect((await listNotifications(db, caller, "a")).map(row => row.id)).toEqual(["n-a"]);
    expect(await markNotificationRead(db, caller, "n-a", "a")).toMatchObject({ isRead: true });
    await markAllNotificationsRead(db, caller, "a");
    await expect(listNotifications(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markNotificationRead(db, caller, "n-b", "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markAllNotificationsRead(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(insertNotification(db, caller, { hotelId: "b", type: "system", message: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(insertNotification(db, caller, { hotelId: "a", type: "system", message: "yes" })).resolves.toMatchObject({ hotelId: "a" });
  });

  it("rejects cross-hotel notification access", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await seedNotification("n-a", "a");
    await seedNotification("n-b", "b");
    const caller = { userId: "owner-a" };
    await expect(listNotifications(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markNotificationRead(db, caller, "n-b", "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markAllNotificationsRead(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(insertNotification(db, caller, { hotelId: "b", type: "system", message: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("limits global reads and mark-all to the platform permission", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await seedNotification("n-a", "a");
    await seedNotification("n-b", "b");
    await expect(listAllNotifications(db, { userId: "owner-a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markSystemNotificationsRead(db, { userId: "owner-a" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await seedHotel("platform", "root", "super_admin");
    expect(await listAllNotifications(db, { userId: "root" })).toHaveLength(2);
    await markSystemNotificationsRead(db, { userId: "root" });
    expect((await db.select().from(notifications).where(notifications.isRead)).length).toBe(2);
  });
});
