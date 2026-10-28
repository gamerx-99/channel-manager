import { TRPCError } from "@trpc/server";
import type { R2Bucket } from "@cloudflare/workers-types/index.ts";
import { and, eq } from "drizzle-orm";
import { hotelMedia } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export const MAX_HOTEL_MEDIA_BYTES = 5 * 1024 * 1024;
export const HOTEL_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function validateHotelMediaUpload(data: Uint8Array, contentType: string, filename: string) {
  const normalizedType = contentType.split(";")[0]!.trim().toLowerCase();
  if (data.byteLength > MAX_HOTEL_MEDIA_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Images must be 5 MiB or smaller." });
  }
  if (!/^image\/[a-z0-9][a-z0-9.+-]*$/.test(normalizedType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only image files can be uploaded." });
  }
  const suppliedExtension = filename.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  const mimeExtension = normalizedType.slice("image/".length).split("+")[0]!.split(".").pop() ?? "";
  const extension = /^[a-z0-9]{1,10}$/.test(suppliedExtension)
    ? suppliedExtension
    : normalizedType === "image/jpeg" ? "jpg"
      : normalizedType === "image/svg+xml" ? "svg"
        : /^[a-z0-9]{1,10}$/.test(mimeExtension) ? mimeExtension : "img";
  return { contentType: normalizedType, extension };
}

/** Validate a stored/object path and return its canonical hotel-prefixed R2 key. */
export function validateHotelMediaObjectKey(hotelId: string, candidate: string): string {
  if (!hotelId || !candidate || candidate.startsWith("/") || candidate.includes("\\") || candidate.includes("?") || candidate.includes("#")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hotel media object key." });
  }
  const parts = candidate.split("/");
  if (parts.length !== 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hotel media object key." });
  let prefix: string;
  let filename: string;
  try {
    prefix = decodeURIComponent(parts[0]!);
    filename = decodeURIComponent(parts[1]!);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hotel media object key." });
  }
  if (prefix !== hotelId || filename === "." || filename === ".." || filename.includes("/") || filename.includes("\\")
    || !/^[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i.test(filename)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hotel media object key." });
  }
  return `${hotelId}/${filename}`;
}

function storedR2Key(hotelId: string, url: string) {
  if (/^https?:\/\//i.test(url)) return null; // Existing Supabase media is not stored in this R2 bucket.
  if (url.startsWith("/media/")) return validateHotelMediaObjectKey(hotelId, url.slice("/media/".length));
  return validateHotelMediaObjectKey(hotelId, url);
}

export async function uploadHotelMediaToR2(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  bucket: R2Bucket,
  input: { hotel_id: string; filename: string; content_type: string; data: Uint8Array; caption?: string | null },
  now = new Date(),
) {
  const scope = await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_profile", "hotel_media.upload", now);
  const { contentType, extension } = validateHotelMediaUpload(input.data, input.content_type, input.filename);
  const mediaId = crypto.randomUUID();
  const filename = `${crypto.randomUUID()}.${extension}`;
  const key = `${scope.hotelId}/${filename}`;
  const url = `/media/${key}`;
  try {
    await bucket.put(key, input.data, {
      httpMetadata: { contentType, cacheControl: HOTEL_MEDIA_CACHE_CONTROL },
      customMetadata: { hotelId: scope.hotelId, mediaId },
    });
    const existing = await db.select({ id: hotelMedia.id }).from(hotelMedia).where(eq(hotelMedia.hotelId, scope.hotelId));
    if (existing.length === 0) {
      const outcomes = await db.$client.batch([
        db.$client.prepare("UPDATE hotel_media SET is_hero = 0 WHERE hotel_id = ?").bind(scope.hotelId),
        db.$client.prepare(`INSERT INTO hotel_media (id, hotel_id, url, caption, is_hero, display_order)
          VALUES (?, ?, ?, ?, 1, ?)`)
          .bind(mediaId, scope.hotelId, url, input.caption ?? input.filename, existing.length),
      ]);
      if (outcomes[1]?.meta.changes !== 1) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media row could not be created." });
      }
    } else {
      const [inserted] = await db.insert(hotelMedia).values({
        id: mediaId,
        hotelId: scope.hotelId,
        url,
        caption: input.caption ?? input.filename,
        isHero: false,
        displayOrder: existing.length,
      }).returning({ id: hotelMedia.id });
      if (!inserted) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media row could not be created." });
    }
    const [media] = await db.select().from(hotelMedia).where(and(eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, scope.hotelId))).limit(1);
    if (!media) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media row could not be read." });
    return media;
  } catch {
    await bucket.delete(key).catch(() => undefined);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media upload failed." });
  }
}

export async function deleteHotelMediaFromR2(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  bucket: R2Bucket,
  hotelId: string,
  mediaId: string,
  now = new Date(),
) {
  const scope = await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.delete", now);
  const [current] = await db.select().from(hotelMedia).where(and(
    eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, scope.hotelId),
  )).limit(1);
  if (!current) return null;
  const key = storedR2Key(scope.hotelId, current.url);
  if (key) {
    try {
      await bucket.delete(key);
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel media could not be deleted." });
    }
  }
  const [deleted] = await db.delete(hotelMedia).where(and(
    eq(hotelMedia.id, mediaId), eq(hotelMedia.hotelId, scope.hotelId),
  )).returning({ id: hotelMedia.id });
  if (!deleted) return null;
  await db.$client.batch([db.$client.prepare(`UPDATE hotel_media
    SET is_hero = (id = (SELECT id FROM hotel_media WHERE hotel_id = ? ORDER BY display_order LIMIT 1))
    WHERE hotel_id = ? AND NOT EXISTS (SELECT 1 FROM hotel_media WHERE hotel_id = ? AND is_hero = 1)`)
    .bind(scope.hotelId, scope.hotelId, scope.hotelId)]);
  return { id: deleted.id };
}
