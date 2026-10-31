import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "./db/scope";
import { setHotelPublicEnabled } from "./d1/hotel";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const HOTEL = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
const OTHER = "e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a";

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  await db.insert(hotels).values([
    { id: HOTEL, name: "Mine", slug: "mine", address: "A", ownerContact: "o", publicEnabled: false },
    { id: OTHER, name: "Other", slug: "other", address: "B", ownerContact: "p", publicEnabled: false },
  ]);
  await db.insert(hotelUsers).values([
    { id: "m1", hotelId: HOTEL, userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] },
    { id: "m2", hotelId: HOTEL, userId: "desk", role: "front_desk", permissionGrants: [], permissionRevokes: [] },
  ]);
});
afterEach(() => sqlite.close());

const isPublic = (id: string) => (sqlite.prepare("select public_enabled as p from hotels where id = ?").get(id) as { p: number }).p;

describe("setHotelPublicEnabled", () => {
  it("lets the owner publish and unpublish their own hotel", async () => {
    await expect(setHotelPublicEnabled(db, { userId: "owner" }, HOTEL, true)).resolves.toEqual({ id: HOTEL, public_enabled: true });
    expect(isPublic(HOTEL)).toBe(1);
    await setHotelPublicEnabled(db, { userId: "owner" }, HOTEL, false);
    expect(isPublic(HOTEL)).toBe(0);
  });

  it("refuses staff without property.manage_profile and other hotels", async () => {
    await expect(setHotelPublicEnabled(db, { userId: "desk" }, HOTEL, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHotelPublicEnabled(db, { userId: "owner" }, OTHER, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(isPublic(HOTEL)).toBe(0);
    expect(isPublic(OTHER)).toBe(0);
  });
});

describe("channelManager.setHotelPublished", () => {
  async function routerCaller(role: "hotel_owner" | "front_desk", hotelId = HOTEL) {
    const { appRouter } = await import("./routers");
    return appRouter.createCaller({
      clientIp: `publish-${role}`,
      db,
      caller: { userId: role === "hotel_owner" ? "owner" : "desk", roles: [role], access: "authenticated" },
      user: { id: role === "hotel_owner" ? "owner" : "desk", email: null, name: null, accessToken: "t", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId, role }] },
    } as never);
  }

  it("publishes for the owner", async () => {
    const app = await routerCaller("hotel_owner");
    await expect(app.channelManager.setHotelPublished({ hotel_id: HOTEL, public_enabled: true })).resolves.toEqual({ id: HOTEL, public_enabled: true });
  });

  it("is refused for front desk before touching the database", async () => {
    const app = await routerCaller("front_desk");
    const spy = vi.spyOn(db, "update");
    await expect(app.channelManager.setHotelPublished({ hotel_id: HOTEL, public_enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(spy).not.toHaveBeenCalled();
  });
});
