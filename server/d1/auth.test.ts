import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { getUserByOpenId, isSuperAdmin, upsertUser } from "./auth";

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
});

afterEach(() => sqlite.close());

describe("D1 auth compatibility repository", () => {
  it("checks super-admin status only from the caller's own membership", async () => {
    await db.insert(hotels).values({ id: "h", name: "h", slug: "h", address: "a", ownerContact: "x" });
    await db.insert(hotelUsers).values({ id: "m", hotelId: "h", userId: "root", role: "super_admin", permissionGrants: [], permissionRevokes: [] });
    expect(await isSuperAdmin(db, { userId: "root" })).toBe(true);
    expect(await isSuperAdmin(db, { userId: "other" })).toBe(false);
  });

  it("keeps removed template OAuth lookups and writes inert", async () => {
    await expect(getUserByOpenId(db, { userId: "root" }, "open-id")).resolves.toBeUndefined();
    await expect(upsertUser(db, { userId: "root" }, { openId: "open-id" })).resolves.toBeUndefined();
  });
});
