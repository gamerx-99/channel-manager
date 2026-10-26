// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export const HOTEL_MEDIA_BUCKET = "hotel-media";

/**
 * Uploads a hotel media file directly to Supabase Storage bucket `hotel-media` under path `<hotel_id>/<filename>`.
 * Uses the caller's RLS Supabase client (scoped with the user's accessToken) so PostgreSQL
 * storage.objects RLS policies are enforced.
 */
export async function uploadHotelMediaToStorage(
  client: SupabaseClient,
  hotelId: string,
  filename: string,
  data: Buffer | Uint8Array,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dotIdx = sanitized.lastIndexOf(".");
  const base = dotIdx === -1 ? sanitized : sanitized.slice(0, dotIdx);
  const ext = dotIdx === -1 ? "" : sanitized.slice(dotIdx);
  const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const objectName = `${hotelId}/${base}_${uniqueSuffix}${ext}`;

  const { error: uploadError } = await client.storage
    .from(HOTEL_MEDIA_BUCKET)
    .upload(objectName, data, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload media to storage: ${uploadError.message}`);
  }

  const { data: publicData } = client.storage
    .from(HOTEL_MEDIA_BUCKET)
    .getPublicUrl(objectName);

  return { key: objectName, url: publicData.publicUrl };
}

/**
 * Removes a file from the `hotel-media` bucket if the URL or path belongs to it.
 */
export async function deleteHotelMediaFromStorage(
  client: SupabaseClient,
  urlOrPath: string,
): Promise<void> {
  let objectPath = urlOrPath;
  const publicPrefix = `/storage/v1/object/public/${HOTEL_MEDIA_BUCKET}/`;
  const idx = urlOrPath.indexOf(publicPrefix);
  if (idx !== -1) {
    objectPath = urlOrPath.slice(idx + publicPrefix.length);
  }

  if (!objectPath || objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
    // Not a relative bucket object path, skip
    return;
  }

  const { error } = await client.storage
    .from(HOTEL_MEDIA_BUCKET)
    .remove([objectPath]);

  if (error) {
    console.warn(`[Storage] Failed to delete media ${objectPath}:`, error.message);
  }
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
