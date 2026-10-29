import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelMedia, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHotelMedia, deleteHotelMedia, getHotelSiteConfig, getHotelSiteConfigBySlug, listHotelMedia, saveHotelSiteConfig, setHotelMediaHero } from "./siteConfig";

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
});

afterEach(() => sqlite.close());

async function seedHotel(id: string, owner: string, publicEnabled = true) {
  await db.insert(hotels).values({ id, name: id, slug: `${id}-slug`, address: "address", ownerContact: `${owner}@example.test`, publicEnabled });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
}

describe("D1 site config and media repository", () => {
  it("scopes config and media writes and keeps a single hero in the hotel", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    await expect(saveHotelSiteConfig(db, caller, { hotel_id: "a", hero_copy: "Welcome", visible_sections: { rooms: true } }))
      .resolves.toMatchObject({ hotelId: "a", heroCopy: "Welcome" });
    expect(await getHotelSiteConfig(db, caller, "a")).toMatchObject({ heroCopy: "Welcome" });
    await expect(getHotelSiteConfig(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveHotelSiteConfig(db, caller, { hotel_id: "b", hero_copy: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await createHotelMedia(db, caller, { hotel_id: "a", url: "r2/a/1", is_hero: true });
    const second = await createHotelMedia(db, caller, { hotel_id: "a", url: "r2/a/2" });
    await setHotelMediaHero(db, caller, "a", second.id);
    await expect(createHotelMedia(db, caller, { hotel_id: "b", url: "r2/b/1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listHotelMedia(db, caller, "a")).filter(media => media.isHero).map(media => media.id)).toEqual([second.id]);
    await expect(listHotelMedia(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelMedia(db, caller, "b", first.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelMedia(db, caller, "a", first.id)).resolves.toMatchObject({ id: first.id });
    await expect(setHotelMediaHero(db, caller, "a", "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows public config lookup only for server-created public context and published hotels", async () => {
    await seedHotel("a", "owner-a", true);
    await seedHotel("b", "owner-b", false);
    await saveHotelSiteConfig(db, { userId: "owner-a" }, { hotel_id: "a", hero_copy: "Public" });
    await expect(getHotelSiteConfigBySlug(db, { userId: "", access: "public" }, "a-slug")).resolves.toMatchObject({ heroCopy: "Public" });
    await expect(getHotelSiteConfigBySlug(db, { userId: "", access: "public" }, "b-slug")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getHotelSiteConfigBySlug(db, { userId: "owner-a" }, "a-slug")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not synthesize a successful save when persisted config violates the schema", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const original = await createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "hero", is_hero: true });
    await expect(saveHotelSiteConfig(db, { userId: "owner-a" }, {
      hotel_id: "a", accent_color: "#ZZZZZZ",
    })).rejects.toThrow();
    await expect(createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: null as unknown as string, is_hero: true })).rejects.toThrow();
    expect((await db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, "a"))).find(media => media.id === original.id)?.isHero).toBe(true);
    expect(await db.select().from(hotelMedia)).toHaveLength(1);
  });

  it("serializes concurrent hero creates so exactly one remains hero", async () => {
    await seedHotel("a", "owner-a");
    await Promise.all([
      createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "hero-1", is_hero: true }),
      createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "hero-2", is_hero: true }),
    ]);
    expect((await db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, "a"))).filter(media => media.isHero)).toHaveLength(1);
  });
});
