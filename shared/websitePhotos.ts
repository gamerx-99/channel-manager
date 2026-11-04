import { MAX_WEBSITE_GALLERY_PHOTOS } from "./hotelThemes";

// ASSUMPTION: captions are trimmed and limited to 120 characters.
export function trimPhotoCaption(value: string) {
  return value.trim().slice(0, 120);
}

export function exceedsWebsitePhotoLimit(ids: string[]) {
  return ids.length > MAX_WEBSITE_GALLERY_PHOTOS;
}

/** Older uploads stored the file name as the caption; treat those as "no caption". */
export function displayPhotoCaption(caption: string | null | undefined): string | null {
  const value = caption?.trim() ?? "";
  return !value || /^[^/\\]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(value) ? null : value;
}
