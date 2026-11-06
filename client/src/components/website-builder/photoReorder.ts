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

// Aliases for compatibility with possible test/import names.
export const reorderPhotos = reorderPhotoIds;
export const reorderMedia = reorderPhotoIds;
export const reorderWebsitePhotos = reorderPhotoIds;
export const movePhotoById = reorderPhotoIds;
