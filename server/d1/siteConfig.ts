import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { hotelMedia, hotelSiteConfig } from "../../drizzle/d1-schema";
import { authorizeHotelAction, requirePublicHotel, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { servedMediaUrl } from "./media";
import { isHotelThemeId } from "../../shared/hotelThemes";

export const DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR = "#954831";

export async function getHotelSiteConfig(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "site_config.read", now);
  const [row] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  return row ?? null;
}

export async function getHotelSiteConfigBySlug(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  const hotel = await requirePublicHotel(db, caller, slug);
  const [row] = await db.select({ hotelId: hotelSiteConfig.hotelId, heroCopy: hotelSiteConfig.heroCopy, accentColor: hotelSiteConfig.accentColor, visibleSections: hotelSiteConfig.visibleSections, theme: hotelSiteConfig.theme, updatedAt: hotelSiteConfig.updatedAt, publishedAt: hotelSiteConfig.publishedAt }).from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotel.id)).limit(1);
  return row ?? null;
}

export async function saveHotelSiteConfig(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; hero_copy?: string | null; accent_color?: string | null; visible_sections?: Record<string, boolean> | null; theme?: string | null; hero_media_id?: string | null; media_positions?: Record<string, string | null> },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_profile", "site_config.save", now);
  if (input.theme != null && !isHotelThemeId(input.theme)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown hotel theme." });
  if (input.accent_color != null && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(input.accent_color)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a valid hex color." });
  const [current] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, input.hotel_id)).limit(1);
  const previousDraft = current?.draftJson ? JSON.parse(current.draftJson) : {};
  const draft = {
    heroCopy: input.hero_copy !== undefined ? input.hero_copy : previousDraft.heroCopy ?? current?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY,
    accentColor: input.accent_color !== undefined ? input.accent_color : previousDraft.accentColor ?? current?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR,
    visibleSections: input.visible_sections !== undefined ? input.visible_sections : previousDraft.visibleSections ?? current?.visibleSections ?? { hero: true, story: true, rooms: true, booking: true, location: true },
    theme: input.theme !== undefined ? input.theme : previousDraft.theme ?? current?.theme ?? null,
    heroMediaId: input.hero_media_id !== undefined ? input.hero_media_id : previousDraft.heroMediaId ?? null,
    mediaPositions: input.media_positions ?? previousDraft.mediaPositions ?? {},
  };
  const [row] = await db.insert(hotelSiteConfig).values({ hotelId: input.hotel_id, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Site config save returned no record." });
  return row;
}

export async function publishHotelSiteConfig(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "site_config.publish", now);
  const [row] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  if (!row?.draftJson) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no saved draft to publish." });
  const draft = JSON.parse(row.draftJson) as { heroCopy: string; accentColor: string; visibleSections: Record<string, boolean>; theme: string | null; heroMediaId: string | null; mediaPositions: Record<string, string | null> };
  if (draft.heroMediaId) {
    const [hero] = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, draft.heroMediaId))).limit(1);
    if (!hero) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected hero image is no longer available." });
  }
  const statements = [
    db.$client.prepare(`UPDATE hotel_site_config SET hero_copy = ?, accent_color = ?, visible_sections = ?, theme = ?, draft_json = NULL, draft_updated_at = NULL, published_at = ?, updated_at = ? WHERE hotel_id = ?`)
      .bind(draft.heroCopy, draft.accentColor, JSON.stringify(draft.visibleSections), draft.theme, now.getTime(), now.getTime(), hotelId),
  ];
  if (draft.heroMediaId !== null) statements.push(db.$client.prepare("UPDATE hotel_media SET is_hero = (id = ?) WHERE hotel_id = ?").bind(draft.heroMediaId, hotelId));
  // Publishing makes the owner's whole current website live, gallery images included;
  // uploads stay private only until this step.
  statements.push(db.$client.prepare("UPDATE hotel_media SET is_published = 1 WHERE hotel_id = ? AND is_published = 0").bind(hotelId));
  for (const [id, position] of Object.entries(draft.mediaPositions)) statements.push(db.$client.prepare("UPDATE hotel_media SET object_position = ? WHERE hotel_id = ? AND id = ?").bind(position, hotelId, id));
  await db.$client.batch(statements);
  return { publishedAt: now };
}

export async function discardHotelSiteConfigDraft(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "site_config.discard", now);
  await db.update(hotelSiteConfig).set({ draftJson: null, draftUpdatedAt: null, updatedAt: now }).where(eq(hotelSiteConfig.hotelId, hotelId));
  return { discarded: true };
}

export async function listHotelMedia(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "hotel_media.list", now);
  const rows = await db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, hotelId)).orderBy(asc(hotelMedia.displayOrder));
  return rows.map(row => ({ ...row, url: servedMediaUrl(row.url) }));
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
  // ASSUMPTION: deletion of the currently published hero is blocked; owners can select another image first.
  const [current] = await db.select({ isHero: hotelMedia.isHero }).from(hotelMedia).where(and(eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, hotelId))).limit(1);
  if (current?.isHero) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose another hero image before deleting this image." });
  const [row] = await db.delete(hotelMedia).where(and(
    eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, hotelId),
  )).returning({ id: hotelMedia.id, url: hotelMedia.url });
  return row ?? null;
}

export async function setHotelMediaHero(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.set_hero", now);
  const [row] = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, mediaId))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel media not found." });
  // ASSUMPTION: selection is recorded in draft_json and changes public media only on publish.
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const draft = config?.draftJson ? JSON.parse(config.draftJson) : { heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR, visibleSections: config?.visibleSections ?? {}, theme: config?.theme ?? null, mediaPositions: {} };
  draft.heroMediaId = mediaId;
  await db.insert(hotelSiteConfig).values({ hotelId, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now }).onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } });
}

export async function setHotelMediaObjectPosition(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, objectPosition: string | null, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.set_object_position", now);
  const [media] = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, mediaId))).limit(1);
  if (!media) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel media not found." });
  // ASSUMPTION: focal point edits are draft changes and publish together with site settings.
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const draft = config?.draftJson ? JSON.parse(config.draftJson) : { heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR, visibleSections: config?.visibleSections ?? {}, theme: config?.theme ?? null, heroMediaId: null, mediaPositions: {} };
  draft.mediaPositions = { ...draft.mediaPositions, [mediaId]: objectPosition };
  await db.insert(hotelSiteConfig).values({ hotelId, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now }).onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } });
  return { id: mediaId, objectPosition };
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
