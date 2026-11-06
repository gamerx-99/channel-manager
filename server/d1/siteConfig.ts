import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { hotelMedia, hotelSiteConfig } from "../../drizzle/d1-schema";
import { authorizeHotelAction, requirePublicHotel, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { servedMediaUrl } from "./media";
import { isHotelThemeId, MAX_WEBSITE_GALLERY_PHOTOS } from "../../shared/hotelThemes";
import { exceedsWebsitePhotoLimit, trimPhotoCaption } from "../../shared/websitePhotos";

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
    mediaCaptions: previousDraft.mediaCaptions ?? {},
    galleryMediaIds: previousDraft.galleryMediaIds,
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
  const draft = JSON.parse(row.draftJson) as { heroCopy: string; accentColor: string; visibleSections: Record<string, boolean>; theme: string | null; heroMediaId: string | null; mediaPositions: Record<string, string | null>; mediaCaptions?: Record<string, string>; galleryMediaIds?: string[] };
  const liveHeroMediaId = draft.heroMediaId ?? (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.isHero, true))).limit(1))[0]?.id ?? null;
  const galleryCandidate: string[] = draft.galleryMediaIds ?? (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.isPublished, true), eq(hotelMedia.isHero, false))).orderBy(asc(hotelMedia.displayOrder))).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(row => row.id);
  const orderedMediaIds = (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(eq(hotelMedia.hotelId, hotelId)).orderBy(asc(hotelMedia.displayOrder))).map(item => item.id);
  const existingMediaIds = new Set(orderedMediaIds);
  const galleryIds = galleryCandidate.filter(id => existingMediaIds.has(id) && id !== liveHeroMediaId);
  if (galleryIds.length > MAX_WEBSITE_GALLERY_PHOTOS) throw new TRPCError({ code: "BAD_REQUEST", message: "A maximum of six gallery photos can be shown." });
  if (draft.heroMediaId) {
    const [hero] = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, draft.heroMediaId))).limit(1);
    if (!hero) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected hero image is no longer available." });
  }
  const statements = [
    db.$client.prepare(`UPDATE hotel_site_config SET hero_copy = ?, accent_color = ?, visible_sections = ?, theme = ?, draft_json = NULL, draft_updated_at = NULL, published_at = ?, updated_at = ? WHERE hotel_id = ?`)
      .bind(draft.heroCopy, draft.accentColor, JSON.stringify(draft.visibleSections), draft.theme, now.getTime(), now.getTime(), hotelId),
  ];
  if (liveHeroMediaId !== null) statements.push(db.$client.prepare("UPDATE hotel_media SET is_hero = (id = ?) WHERE hotel_id = ?").bind(liveHeroMediaId, hotelId));
  statements.push(db.$client.prepare("UPDATE hotel_media SET is_hero = 0 WHERE hotel_id = ? AND is_hero = 1 AND id != ?").bind(hotelId, liveHeroMediaId ?? ""));
  // is_published remains the public visibility flag: only the cover and staged gallery go live.
  statements.push(db.$client.prepare(`UPDATE hotel_media SET is_published = CASE WHEN id = ? OR id IN (${galleryIds.length ? galleryIds.map(() => "?").join(",") : "NULL"}) THEN 1 ELSE 0 END WHERE hotel_id = ?`).bind(liveHeroMediaId ?? "", ...galleryIds, hotelId));
  // Guests see photos in display_order, so the staged order (cover, then gallery) becomes display_order;
  // photos not on the website keep their relative order after them.
  if (Array.isArray(draft.galleryMediaIds)) {
    const front = liveHeroMediaId !== null && existingMediaIds.has(liveHeroMediaId) ? [liveHeroMediaId, ...galleryIds] : galleryIds;
    const newOrder = [...front, ...orderedMediaIds.filter(id => !front.includes(id))];
    newOrder.forEach((id, index) => statements.push(db.$client.prepare("UPDATE hotel_media SET display_order = ? WHERE hotel_id = ? AND id = ?").bind(index, hotelId, id)));
  }
  for (const [id, position] of Object.entries(draft.mediaPositions)) statements.push(db.$client.prepare("UPDATE hotel_media SET object_position = ? WHERE hotel_id = ? AND id = ?").bind(position, hotelId, id));
  for (const [id, caption] of Object.entries(draft.mediaCaptions ?? {})) statements.push(db.$client.prepare("UPDATE hotel_media SET caption = ? WHERE hotel_id = ? AND id = ?").bind(caption, hotelId, id));
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
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  if (config?.draftJson) {
    const draft = JSON.parse(config.draftJson);
    if (Array.isArray(draft.galleryMediaIds)) draft.galleryMediaIds = draft.galleryMediaIds.filter((id: string) => id !== mediaId);
    if (draft.mediaCaptions) delete draft.mediaCaptions[mediaId];
    if (draft.mediaPositions) delete draft.mediaPositions[mediaId];
    await db.update(hotelSiteConfig).set({ draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now }).where(eq(hotelSiteConfig.hotelId, hotelId));
  }
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
  const draft = config?.draftJson ? JSON.parse(config.draftJson) : { heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR, visibleSections: config?.visibleSections ?? {}, theme: config?.theme ?? null, mediaPositions: {}, galleryMediaIds: (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.isPublished, true), eq(hotelMedia.isHero, false))).orderBy(asc(hotelMedia.displayOrder))).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(item => item.id) };
  if (!Array.isArray(draft.galleryMediaIds)) draft.galleryMediaIds = (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.isPublished, true), eq(hotelMedia.isHero, false))).orderBy(asc(hotelMedia.displayOrder))).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(item => item.id);
  draft.heroMediaId = mediaId;
  draft.galleryMediaIds = (draft.galleryMediaIds ?? []).filter((id: string) => id !== mediaId);
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

export async function setHotelMediaCaption(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, caption: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.set_caption", now);
  const [media] = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, mediaId))).limit(1);
  if (!media) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel media not found." });
  const value = trimPhotoCaption(caption);
  if (value.length > 120) throw new TRPCError({ code: "BAD_REQUEST", message: "Photo captions must be 120 characters or fewer." });
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const draft = config?.draftJson ? JSON.parse(config.draftJson) : { heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR, visibleSections: config?.visibleSections ?? {}, theme: config?.theme ?? null, heroMediaId: null, mediaPositions: {} };
  draft.mediaCaptions = { ...draft.mediaCaptions, [mediaId]: value };
  await db.insert(hotelSiteConfig).values({ hotelId, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now }).onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } });
  return { id: mediaId, caption: value };
}

export async function setHotelMediaGallerySelection(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, mediaId: string, shown: boolean, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.gallery_selection", now);
  const [media] = await db.select({ id: hotelMedia.id, isHero: hotelMedia.isHero }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.id, mediaId))).limit(1);
  if (!media) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel media not found." });
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const draft = config?.draftJson ? JSON.parse(config.draftJson) : { heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR, visibleSections: config?.visibleSections ?? {}, theme: config?.theme ?? null, heroMediaId: null, mediaPositions: {}, mediaCaptions: {} };
  const selected = (draft.galleryMediaIds ?? (await db.select({ id: hotelMedia.id }).from(hotelMedia).where(and(eq(hotelMedia.hotelId, hotelId), eq(hotelMedia.isPublished, true), eq(hotelMedia.isHero, false))).orderBy(asc(hotelMedia.displayOrder))).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(row => row.id)).filter((id: string) => id !== mediaId);
  if (shown && draft.heroMediaId !== mediaId) selected.push(mediaId);
  if (exceedsWebsitePhotoLimit(selected)) throw new TRPCError({ code: "BAD_REQUEST", message: "A maximum of six gallery photos can be shown." });
  draft.galleryMediaIds = selected;
  await db.insert(hotelSiteConfig).values({ hotelId, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now }).onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } });
  return { selected };
}

export async function reorderHotelMedia(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; ids: string[] },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_profile", "site_config.reorder_media", now);
  const hotelId = input.hotel_id;
  const ids = input.ids;
  const [config] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const previousDraft = config?.draftJson ? JSON.parse(config.draftJson) : null;
  const rows = await db.select({ id: hotelMedia.id, isHero: hotelMedia.isHero, isPublished: hotelMedia.isPublished }).from(hotelMedia)
    .where(eq(hotelMedia.hotelId, hotelId)).orderBy(asc(hotelMedia.displayOrder));
  const current = currentDraftPhotoOrder(rows, previousDraft);
  // Order change only: the ids must be exactly the current draft cover and gallery, nothing added or removed.
  const expected = new Set(current.ids);
  if (ids.length !== current.ids.length || new Set(ids).size !== ids.length || ids.some(id => !expected.has(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The photo order must contain exactly the cover and the gallery photos." });
  }
  // ASSUMPTION: with no cover in the draft, every id is a gallery photo and the cover stays unset.
  const heroMediaId = current.hasCover ? ids[0]! : previousDraft?.heroMediaId ?? null;
  const galleryMediaIds = current.hasCover ? ids.slice(1) : [...ids];
  const draft = {
    heroCopy: config?.heroCopy ?? DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY,
    accentColor: config?.accentColor ?? DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR,
    visibleSections: config?.visibleSections ?? { hero: true, story: true, rooms: true, booking: true, location: true },
    theme: config?.theme ?? null,
    mediaPositions: {},
    mediaCaptions: {},
    ...(previousDraft ?? {}),
    heroMediaId,
    galleryMediaIds,
  };
  await db.insert(hotelSiteConfig).values({ hotelId, draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: hotelSiteConfig.hotelId, set: { draftJson: JSON.stringify(draft), draftUpdatedAt: now, updatedAt: now } });
  return { heroMediaId, galleryMediaIds };
}

// The cover and gallery the owner currently sees in the builder. Mirrors the client fallback in
// useWebsiteBuilder.ts: without a staged gallery, the first six published non-cover photos.
function currentDraftPhotoOrder(
  rows: { id: string; isHero: boolean; isPublished: boolean }[],
  draft: { heroMediaId?: string | null; galleryMediaIds?: unknown } | null,
) {
  const existing = new Set(rows.map(row => row.id));
  const heroId = draft?.heroMediaId ?? rows.find(row => row.isHero)?.id ?? null;
  const hasCover = heroId !== null && existing.has(heroId);
  const staged = Array.isArray(draft?.galleryMediaIds)
    ? (draft.galleryMediaIds as string[])
    : rows.filter(row => row.isPublished && !row.isHero).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(row => row.id);
  const gallery = staged.filter(id => existing.has(id) && id !== heroId);
  return { hasCover, ids: hasCover ? [heroId!, ...gallery] : gallery };
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
