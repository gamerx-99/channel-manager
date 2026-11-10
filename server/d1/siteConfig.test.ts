import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelMedia, hotelSiteConfig, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createHotelMedia, deleteHotelMedia, discardHotelSiteConfigDraft, getHotelSiteConfig, getHotelSiteConfigBySlug, listHotelMedia, publishHotelSiteConfig, reorderHotelMedia, saveHotelSiteConfig, setHotelMediaCaption, setHotelMediaGallerySelection, setHotelMediaHero, setHotelMediaObjectPosition } from "./siteConfig";
import { getPublicHotel } from "./hotel";

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
  it("stages captions and gallery selection, trims captions and enforces six selected photos", async () => {
    await seedHotel("a", "owner-a");
    const caller = { userId: "owner-a" };
    const photos = await Promise.all(Array.from({ length: 7 }, (_, i) => createHotelMedia(db, caller, { hotel_id: "a", url: `/media/a/${i}.jpg` })));
    await setHotelMediaCaption(db, caller, "a", photos[0]!.id, "  Garden view  ");
    expect(JSON.parse((await getHotelSiteConfig(db, caller, "a"))!.draftJson!).mediaCaptions[photos[0]!.id]).toBe("Garden view");
    for (const photo of photos.slice(0, 6)) await setHotelMediaGallerySelection(db, caller, "a", photo!.id, true);
    await expect(setHotelMediaGallerySelection(db, caller, "a", photos[6]!.id, true)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(setHotelMediaCaption(db, { userId: "owner-b" }, "a", photos[0]!.id, "blocked")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHotelMediaGallerySelection(db, { userId: "owner-b" }, "a", photos[0]!.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteHotelMedia(db, caller, "a", photos[0]!.id);
    expect(JSON.parse((await getHotelSiteConfig(db, caller, "a"))!.draftJson!).galleryMediaIds).not.toContain(photos[0]!.id);
  });

  it("keeps the published gallery on caption-only and cover-only draft changes", async () => {
    await seedHotel("a", "owner-a");
    const caller = { userId: "owner-a" };
    const cover = await createHotelMedia(db, caller, { hotel_id: "a", url: "/cover.jpg", is_hero: true });
    const nextCover = await createHotelMedia(db, caller, { hotel_id: "a", url: "/next-cover.jpg" });
    const gallery = await createHotelMedia(db, caller, { hotel_id: "a", url: "/gallery.jpg" });
    await saveHotelSiteConfig(db, caller, { hotel_id: "a", hero_media_id: cover.id });
    await setHotelMediaGallerySelection(db, caller, "a", gallery.id, true);
    await publishHotelSiteConfig(db, caller, "a");

    await setHotelMediaCaption(db, caller, "a", gallery.id, "Garden view");
    await publishHotelSiteConfig(db, caller, "a");
    expect((await getPublicHotel(db, { userId: "", access: "public" }, "a-slug")).media.map(item => item.id)).toContain(gallery.id);

    await setHotelMediaHero(db, caller, "a", nextCover.id);
    await publishHotelSiteConfig(db, caller, "a");
    const liveMedia = (await getPublicHotel(db, { userId: "", access: "public" }, "a-slug")).media;
    expect(liveMedia.map(item => item.id).sort()).toEqual([nextCover.id, gallery.id].sort());
    expect(liveMedia.find(item => item.id === gallery.id)?.caption).toBe("Garden view");
  });

  it("never returns a stored file-name caption to guests", async () => {
    await seedHotel("a", "owner-a");
    await createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "/media/a/old-photo.jpg", caption: "old-photo.jpg" });
    const result = await getPublicHotel(db, { userId: "", access: "public" }, "a-slug");
    expect(result.media[0]?.caption).toBeNull();
  });

  it("scopes config and media writes and keeps a single hero in the hotel", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    await expect(saveHotelSiteConfig(db, caller, { hotel_id: "a", hero_copy: "Welcome", visible_sections: { rooms: true } }))
      .resolves.toMatchObject({ hotelId: "a", draftJson: expect.stringContaining("Welcome") });
    await publishHotelSiteConfig(db, caller, "a");
    expect(await getHotelSiteConfig(db, caller, "a")).toMatchObject({ heroCopy: "Welcome" });
    await expect(getHotelSiteConfig(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveHotelSiteConfig(db, caller, { hotel_id: "b", hero_copy: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await createHotelMedia(db, caller, { hotel_id: "a", url: "r2/a/1", is_hero: true });
    const second = await createHotelMedia(db, caller, { hotel_id: "a", url: "r2/a/2" });
    await expect(setHotelMediaObjectPosition(db, caller, "a", second.id, "23% 81%")).resolves.toMatchObject({ objectPosition: "23% 81%" });
    expect(await listHotelMedia(db, caller, "a")).toMatchObject([{ id: first.id, objectPosition: null }, { id: second.id, objectPosition: null }]);
    expect((await getHotelSiteConfig(db, caller, "a"))?.draftJson).toContain("23% 81%");
    await expect(setHotelMediaObjectPosition(db, { userId: "owner-b" }, "a", second.id, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setHotelMediaHero(db, caller, "a", second.id);
    await expect(createHotelMedia(db, caller, { hotel_id: "b", url: "r2/b/1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listHotelMedia(db, caller, "a")).filter(media => media.isHero).map(media => media.id)).toEqual([first.id]);
    await expect(listHotelMedia(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelMedia(db, caller, "b", first.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelMedia(db, caller, "a", second.id)).resolves.toMatchObject({ id: second.id });
    await expect(deleteHotelMedia(db, caller, "a", first.id)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(setHotelMediaHero(db, caller, "a", "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows public config lookup only for server-created public context and published hotels", async () => {
    await seedHotel("a", "owner-a", true);
    await seedHotel("b", "owner-b", false);
  await saveHotelSiteConfig(db, { userId: "owner-a" }, { hotel_id: "a", hero_copy: "Public", theme: "cafe-homestay" });
  await expect(getHotelSiteConfigBySlug(db, { userId: "", access: "public" }, "a-slug")).resolves.toMatchObject({ heroCopy: null, theme: null });
  await publishHotelSiteConfig(db, { userId: "owner-a" }, "a");
  await expect(getHotelSiteConfigBySlug(db, { userId: "", access: "public" }, "a-slug")).resolves.toMatchObject({ heroCopy: "Public", theme: "cafe-homestay" });
    await expect(getHotelSiteConfigBySlug(db, { userId: "", access: "public" }, "b-slug")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getHotelSiteConfigBySlug(db, { userId: "owner-a" }, "a-slug")).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 15000);

  it("rejects cross-hotel site config and media access", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    await saveHotelSiteConfig(db, { userId: "owner-b" }, { hotel_id: "b", hero_copy: "Hotel B" });
    await db.insert(hotelMedia).values({ id: 'media-b', hotelId: 'b', url: '/media/b/photo.jpg', isHero: true });
    const caller = { userId: "owner-a" };
    await expect(getHotelSiteConfig(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveHotelSiteConfig(db, caller, { hotel_id: "b", hero_copy: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHotelMedia(db, caller, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createHotelMedia(db, caller, { hotel_id: "b", url: "r2/b/1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteHotelMedia(db, caller, "b", "media-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHotelMediaHero(db, caller, "b", "media-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getHotelSiteConfig(db, { userId: "owner-b" }, "b")).resolves.toMatchObject({ draftJson: expect.stringContaining("Hotel B") });
    expect(await db.select().from(hotelMedia)).toMatchObject([{ id: 'media-b', isHero: true }]);
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

  it("stores only known theme ids and rejects unknown ids", async () => {
    await seedHotel("a", "owner-a");
    await expect(saveHotelSiteConfig(db, { userId: "owner-a" }, { hotel_id: "a", theme: "lanna-teak" }))
      .resolves.toMatchObject({ draftJson: expect.stringContaining("lanna-teak") });
    await expect(saveHotelSiteConfig(db, { userId: "owner-a" }, { hotel_id: "a", theme: "invented-theme" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("saves a theme with an existing two-digit focal point", async () => {
    await seedHotel("a", "owner-a");
    const photo = await createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "/focal.jpg" });

    const saved = await saveHotelSiteConfig(db, { userId: "owner-a" }, {
      hotel_id: "a", theme: "lanna-teak", media_positions: { [photo.id]: "50% 40%" },
    });
    expect(JSON.parse(saved.draftJson!).theme).toBe("lanna-teak");
    expect(JSON.parse(saved.draftJson!).mediaPositions).toEqual({ [photo.id]: "50% 40%" });
  });

  it("validates theme ids at the router boundary and refuses users without website edit permission", async () => {
    const { appRouter } = await import("../routers");
    const hotelId = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
    const caller = appRouter.createCaller({
      req: {} as Request, res: {} as Response, db: {} as any, caller: { userId: "desk", roles: ["front_desk"], access: "authenticated" },
      user: { id: "desk", email: null, name: null, accessToken: "t", appMetadata: {}, userMetadata: {}, role: "front_desk", roles: ["front_desk"], memberships: [{ hotelId, role: "front_desk" }] },
    } as never);
    await expect(caller.channelManager.saveHotelSiteConfig({ hotel_id: hotelId, theme: "unknown" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.channelManager.saveHotelSiteConfig({ hotel_id: hotelId, theme: "minimal-white" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.channelManager.setHotelMediaObjectPosition({ hotel_id: hotelId, media_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4", object_position: "101% 50%" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.channelManager.setHotelMediaObjectPosition({ hotel_id: hotelId, media_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4", object_position: "50% 50%" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 15000);

  it("serializes concurrent hero creates so exactly one remains hero", async () => {
    await seedHotel("a", "owner-a");
    await Promise.all([
      createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "hero-1", is_hero: true }),
      createHotelMedia(db, { userId: "owner-a" }, { hotel_id: "a", url: "hero-2", is_hero: true }),
    ]);
    expect((await db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, "a"))).filter(media => media.isHero)).toHaveLength(1);
  });
});

describe("reorderHotelMedia", () => {
  const owner = { userId: "owner-a" };
  const publicCaller = { userId: "", access: "public" as const };

  // Cover, three gallery photos and one photo the owner turned off "show on website", all published once.
  async function seedPublishedSite() {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const cover = await createHotelMedia(db, owner, { hotel_id: "a", url: "/cover.jpg", is_hero: true, display_order: 0 });
    const [g1, g2, g3, hidden] = await Promise.all([1, 2, 3, 4].map(order => createHotelMedia(db, owner, { hotel_id: "a", url: `/p${order}.jpg`, display_order: order })));
    await saveHotelSiteConfig(db, owner, { hotel_id: "a", hero_copy: "Published", hero_media_id: cover.id });
    await setHotelMediaGallerySelection(db, owner, "a", hidden!.id, false);
    await publishHotelSiteConfig(db, owner, "a");
    await db.insert(hotelMedia).values({ id: "media-b", hotelId: "b", url: "/b.jpg" });
    return { cover: cover.id, g1: g1!.id, g2: g2!.id, g3: g3!.id, hidden: hidden!.id };
  }

  it("changes only the draft until publish, then guests see the new cover and order", async () => {
    const p = await seedPublishedSite();
    await expect(reorderHotelMedia(db, owner, { hotel_id: "a", ids: [p.g3, p.cover, p.g1, p.g2] }))
      .resolves.toEqual({ heroMediaId: p.g3, galleryMediaIds: [p.cover, p.g1, p.g2] });

    const config = await getHotelSiteConfig(db, owner, "a");
    expect(JSON.parse(config!.draftJson!)).toMatchObject({ heroCopy: "Published", heroMediaId: p.g3, galleryMediaIds: [p.cover, p.g1, p.g2] });
    expect(config).toMatchObject({ heroCopy: "Published" });
    expect((await listHotelMedia(db, owner, "a")).filter(item => item.isHero).map(item => item.id)).toEqual([p.cover]);
    expect((await getPublicHotel(db, publicCaller, "a-slug")).media.map(item => item.id)).toEqual([p.cover, p.g1, p.g2, p.g3]);

    await publishHotelSiteConfig(db, owner, "a");
    expect((await listHotelMedia(db, owner, "a")).filter(item => item.isHero).map(item => item.id)).toEqual([p.g3]);
    expect((await getPublicHotel(db, publicCaller, "a-slug")).media.map(item => item.id)).toEqual([p.g3, p.cover, p.g1, p.g2]);
  });

  it("rejects another hotel's photo, a photo not in the gallery, an incomplete set and duplicates", async () => {
    const p = await seedPublishedSite();
    const before = (await getHotelSiteConfig(db, owner, "a"))?.draftJson ?? null;
    for (const ids of [
      [p.g3, p.cover, p.g1, "media-b"],
      [p.g3, p.cover, p.g1, p.g2, p.hidden],
      [p.g3, p.cover, p.g1],
      [p.g3, p.g3, p.g1, p.g2],
    ]) {
      await expect(reorderHotelMedia(db, owner, { hotel_id: "a", ids })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(reorderHotelMedia(db, { userId: "owner-b" }, { hotel_id: "a", ids: [p.g3, p.cover, p.g1, p.g2] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getHotelSiteConfig(db, owner, "a"))?.draftJson ?? null).toBe(before);
  });

  it("works for a hotel with more than seven photos and never brings back a photo turned off", async () => {
    await seedHotel("a", "owner-a");
    const cover = await createHotelMedia(db, owner, { hotel_id: "a", url: "/cover.jpg", is_hero: true, display_order: 0 });
    const photos = await Promise.all(Array.from({ length: 8 }, (_, i) => createHotelMedia(db, owner, { hotel_id: "a", url: `/p${i}.jpg`, display_order: i + 1 })));
    await setHotelMediaGallerySelection(db, owner, "a", photos[1]!.id, false);
    const gallery = JSON.parse((await getHotelSiteConfig(db, owner, "a"))!.draftJson!).galleryMediaIds as string[];
    expect(gallery).toHaveLength(5);
    const ids = [gallery[4]!, ...gallery.slice(0, 4), cover.id];
    await expect(reorderHotelMedia(db, owner, { hotel_id: "a", ids })).resolves.toEqual({ heroMediaId: gallery[4], galleryMediaIds: [...gallery.slice(0, 4), cover.id] });
    expect(JSON.parse((await getHotelSiteConfig(db, owner, "a"))!.draftJson!).galleryMediaIds).not.toContain(photos[1]!.id);
  });
});

describe("public hotel theme", () => {
  it("returns the saved theme id with public hotel data", async () => {
    await seedHotel("pub", "owner-pub", true);
    await saveHotelSiteConfig(db, { userId: "owner-pub" }, { hotel_id: "pub", theme: "lanna-teak" });
    await publishHotelSiteConfig(db, { userId: "owner-pub" }, "pub");
    const { getPublicHotel } = await import("./hotel");
    await expect(getPublicHotel(db, { userId: "", access: "public" }, "pub-slug"))
      .resolves.toMatchObject({ hotel: { theme: "lanna-teak" } });
    expect(await db.select({ theme: hotelSiteConfig.theme }).from(hotelSiteConfig)).toEqual([{ theme: "lanna-teak" }]);
  });
});


describe('hotel media read permission', () => {
  it('allows front desk and revenue manager to read media with property.view', async () => {
    await seedHotel('a', 'owner-a');
    await db.insert(hotelUsers).values([
      { hotelId: 'a', userId: 'front', role: 'front_desk' },
      { hotelId: 'a', userId: 'revenue', role: 'revenue_manager' },
    ]);
    const media = await createHotelMedia(db, { userId: 'owner-a' }, { hotel_id: 'a', url: '/media/a/photo.jpg' });
    for (const userId of ['front', 'revenue']) {
      await expect(listHotelMedia(db, { userId }, 'a')).resolves.toMatchObject([{ id: media.id }]);
      await expect(setHotelMediaHero(db, { userId }, 'a', media.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(deleteHotelMedia(db, { userId }, 'a', media.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});


describe('site config reads', () => {
  it('returns null for missing config and reads saved camelCase copy and colors', async () => {
    await seedHotel('a', 'owner-a');
    const owner = { userId: 'owner-a' };
    const publicCaller = { userId: '', access: 'public' as const };
    await expect(getHotelSiteConfig(db, owner, 'a')).resolves.toBeNull();
    await expect(getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).resolves.toBeNull();
    await saveHotelSiteConfig(db, owner, { hotel_id: 'a', hero_copy: 'Welcome', accent_color: '#123456', visible_sections: { rooms: false }, theme: 'minimal-white' });
    await expect(getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).resolves.toMatchObject({ heroCopy: null, theme: null });
    await publishHotelSiteConfig(db, owner, 'a');
    const expected = { heroCopy: 'Welcome', accentColor: '#123456', visibleSections: { rooms: false }, theme: 'minimal-white' };
    await expect(getHotelSiteConfig(db, owner, 'a')).resolves.toMatchObject(expected);
    await expect(getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).resolves.toMatchObject(expected);
    expect(await getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).not.toHaveProperty('draftJson');
  });

  it('keeps a saved draft out of public config until it is published and scopes publishing', async () => {
    await seedHotel('a', 'owner-a');
    await seedHotel('b', 'owner-b');
    const publicCaller = { userId: '', access: 'public' as const };
    const owner = { userId: 'owner-a' };
    await saveHotelSiteConfig(db, owner, { hotel_id: 'a', hero_copy: 'Published text' });
    await publishHotelSiteConfig(db, owner, 'a');
    await saveHotelSiteConfig(db, owner, { hotel_id: 'a', hero_copy: 'Draft text' });
    const publicBeforePublish = await getHotelSiteConfigBySlug(db, publicCaller, 'a-slug');
    expect(publicBeforePublish).toMatchObject({ heroCopy: 'Published text' });
    expect(publicBeforePublish).not.toHaveProperty('draftJson');
    await expect(publishHotelSiteConfig(db, owner, 'b')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await publishHotelSiteConfig(db, owner, 'a');
    await expect(getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).resolves.toMatchObject({ heroCopy: 'Draft text' });
  });

  it('discards the draft while preserving the published version', async () => {
    await seedHotel('a', 'owner-a');
    const owner = { userId: 'owner-a' };
    const publicCaller = { userId: '', access: 'public' as const };
    await saveHotelSiteConfig(db, owner, { hotel_id: 'a', hero_copy: 'Published text' });
    await publishHotelSiteConfig(db, owner, 'a');
    await saveHotelSiteConfig(db, owner, { hotel_id: 'a', hero_copy: 'Draft text' });
    await expect(discardHotelSiteConfigDraft(db, owner, 'a')).resolves.toEqual({ discarded: true });
    await expect(getHotelSiteConfig(db, owner, 'a')).resolves.toMatchObject({ draftJson: null });
    await expect(getHotelSiteConfigBySlug(db, publicCaller, 'a-slug')).resolves.toMatchObject({ heroCopy: 'Published text' });
  });
});
