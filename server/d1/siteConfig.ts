import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { hotelMedia, hotelSiteConfig } from "../../drizzle/d1-schema";
import { authorizeHotelAction, requirePublicHotel, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export const DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR = "#954831";

export async function getHotelSiteConfig(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "site_config.read", now);
  const [row] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  return row ?? null;
}

export async function getHotelSiteConfigBySlug(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  const hotel = await requirePublicHotel(db, caller, slug);
  const [row] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotel.id)).limit(1);
  return row ?? null;
}

export async function saveHotelSiteConfig(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; hero_copy?: string | null; accent_color?: string | null; visible_sections?: Record<string, boolean> | null },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_profile", "site_config.save", now);
  const [row] = await db.insert(hotelSiteConfig).values({
    hotelId: input.hotel_id,
    heroCopy: input.hero_copy ?? null,
    accentColor: input.accent_color ?? null,
    visibleSections: input.visible_sections ?? null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: hotelSiteConfig.hotelId,
    set: {
      ...(input.hero_copy !== undefined ? { heroCopy: input.hero_copy } : {}),
      ...(input.accent_color !== undefined ? { accentColor: input.accent_color } : {}),
      ...(input.visible_sections !== undefined ? { visibleSections: input.visible_sections } : {}),
      updatedAt: now,
    },
  }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Site config save returned no record." });
  return row;
}

export async function listHotelMedia(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "hotel_media.list", now);
  return db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, hotelId)).orderBy(asc(hotelMedia.displayOrder));
}

export async function createHotelMedia(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; url: string; caption?: string | null; is_hero?: boolean; display_order?: number },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_profile", "hotel_media.create", now);
  if (input.is_hero) {
    const id = crypto.randomUUID();
    await db.$client.batch([
      db.$client.prepare("update hotel_media set is_hero = 0 where hotel_id = ?").bind(input.hotel_id),
      db.$client.prepare(`insert into hotel_media (id, hotel_id, url, caption, is_hero, display_order)
        values (?, ?, ?, ?, 1, ?)`)
        .bind(id, input.hotel_id, input.url, input.caption ?? null, input.display_order ?? 0),
    ]);
    const [created] = await db.select().from(hotelMedia).where(and(
      eq(hotelMedia.id, id), eq(hotelMedia.hotelId, input.hotel_id),
    )).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media insert returned no record." });
    return created;
  }
  const [row] = await db.insert(hotelMedia).values({
    hotelId: input.hotel_id, url: input.url, caption: input.caption ?? null,
    isHero: input.is_hero ?? false, displayOrder: input.display_order ?? 0,
  }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media insert returned no record." });
  return row;
}

export async function deleteHotelMedia(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.delete", now);
  const [row] = await db.delete(hotelMedia).where(and(
    eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, hotelId),
  )).returning({ id: hotelMedia.id, url: hotelMedia.url });
  return row ?? null;
}

export async function setHotelMediaHero(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.set_hero", now);
  const result = await setHeroWithinHotel(db, hotelId, mediaId);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel media not found." });
}

async function setHeroWithinHotel(db: D1ScopedDatabase, hotelId: string, mediaId: string | null) {
  const [row] = await db.update(hotelMedia).set({
    isHero: mediaId === null ? false : sql`${hotelMedia.id} = ${mediaId}`,
  }).where(and(
    eq(hotelMedia.hotelId, hotelId),
    mediaId === null ? undefined : sql`exists (select 1 from hotel_media target where target.id = ${mediaId} and target.hotel_id = ${hotelId})`,
  )).returning({ id: hotelMedia.id });
  return row ?? null;
}
