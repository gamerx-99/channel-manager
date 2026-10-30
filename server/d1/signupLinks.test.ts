import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelSignupLinks, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHotelOwnerMembership, createSignupLink, validateSignupLink } from "./signupLinks";

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

describe("signup links", () => {
  it("refuses a second hotel admin for the same hotel", async () => {
    await db.insert(hotels).values({ id: "h1", name: "H1", slug: "h1", address: "a", ownerContact: "o", publicEnabled: true });
    await db.insert(hotelUsers).values({ id: "m1", hotelId: "h1", userId: "u1", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
    const caller = { userId: "root", roles: ["super_admin"], access: "authenticated" } as any;
    await expect(createSignupLink(db, caller, { hotel_id: "h1", expiresInHours: 24 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates a link for a hotel with no admin", async () => {
    await db.insert(hotels).values({ id: "h2", name: "H2", slug: "h2", address: "a", ownerContact: "o", publicEnabled: true });
    const caller = { userId: "root", roles: ["super_admin"], access: "authenticated" } as any;
    const link = await createSignupLink(db, caller, { hotel_id: "h2", expiresInHours: 24 });
    expect(link.hotel_id).toBe("h2");
  });
});
