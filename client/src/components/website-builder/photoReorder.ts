// Pure helpers for reordering website photos. No I/O, no React.

export function reorderPhotoIds(ids: readonly string[], activeId: string, overId: string): string[] {
  const result = [...ids];
  const from = result.indexOf(activeId);
  const to = result.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return result;
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved!);
  return result;
}

export function movePhoto(ids: readonly string[], fromIndex: number, toIndex: number): string[] {
  const result = [...ids];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= result.length || toIndex >= result.length || fromIndex === toIndex) return result;
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved!);
  return result;
}

export function movePhotoToIndex(ids: readonly string[], activeId: string, toIndex: number): string[] {
  const from = ids.indexOf(activeId);
  if (from < 0 || toIndex < 0 || toIndex >= ids.length) return [...ids];
  return movePhoto(ids, from, toIndex);
}

/**
 * Splits the builder photos into the ones on the website (cover first, then the gallery in the
 * draft order) and the rest. Only the first group can be dragged; the order comes from the draft
 * (`heroMediaId` + `galleryMediaIds`), never from `display_order`.
 */
export function splitWebsitePhotos<T extends { id: string }>(photos: readonly T[], coverId: string | null, galleryIds: readonly string[]) {
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const cover = coverId ? byId.get(coverId) ?? null : null;
  const gallery = galleryIds.filter(id => id !== coverId).map(id => byId.get(id)).filter((photo): photo is T => Boolean(photo));
  const ordered = cover ? [cover, ...gallery] : gallery;
  const shown = new Set(ordered.map(photo => photo.id));
  return { hasCover: Boolean(cover), ordered, others: photos.filter(photo => !shown.has(photo.id)) };
}

/** 1-based position of a photo in the draggable list, or 0 when it is not there. */
export function photoPosition(ids: readonly string[], id: string): number {
  return ids.indexOf(id) + 1;
}
