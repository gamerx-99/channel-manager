import { describe, expect, it } from 'vitest';
import { reorderPhotoIds, movePhoto, movePhotoToIndex, photoPosition, splitWebsitePhotos } from './photoReorder';

describe('splitWebsitePhotos', () => {
  // Media arrive in display_order; the draft says the cover is c and the gallery is g2 then g1.
  const photos = [{ id: 'g1' }, { id: 'hidden' }, { id: 'c' }, { id: 'g2' }];

  it('orders the cover first and then the gallery from the draft, not display_order', () => {
    const { hasCover, ordered, others } = splitWebsitePhotos(photos, 'c', ['g2', 'g1']);
    expect(hasCover).toBe(true);
    expect(ordered.map(p => p.id)).toEqual(['c', 'g2', 'g1']);
    expect(others.map(p => p.id)).toEqual(['hidden']);
  });

  it('skips ids that no longer exist and works without a cover', () => {
    const { hasCover, ordered } = splitWebsitePhotos(photos, null, ['gone', 'g1']);
    expect(hasCover).toBe(false);
    expect(ordered.map(p => p.id)).toEqual(['g1']);
  });

  it('dropping a gallery photo on the cover makes that photo first', () => {
    const { ordered } = splitWebsitePhotos(photos, 'c', ['g2', 'g1']);
    const ids = ordered.map(p => p.id);
    expect(reorderPhotoIds(ids, 'g1', 'c')).toEqual(['g1', 'c', 'g2']);
    expect(photoPosition(ids, 'g1')).toBe(3);
  });
});

describe('photoReorder', () => {
  const ids = ['hero', 'g1', 'g2', 'g3'];

  it('moves a photo forward', () => {
    expect(reorderPhotoIds(ids, 'g1', 'g3')).toEqual(['hero', 'g2', 'g3', 'g1']);
  });

  it('moves a photo backward', () => {
    expect(reorderPhotoIds(ids, 'g3', 'g1')).toEqual(['hero', 'g3', 'g1', 'g2']);
  });

  it('makes a photo the cover when dropped on the cover slot', () => {
    // dropping g2 onto the hero slot (first item) moves it to index 0
    expect(reorderPhotoIds(ids, 'g2', 'hero')).toEqual(['g2', 'hero', 'g1', 'g3']);
  });

  it('returns a copy when ids are invalid', () => {
    expect(reorderPhotoIds(ids, 'nope', 'hero')).toEqual(ids);
    expect(reorderPhotoIds(ids, 'hero', 'nope')).toEqual(ids);
  });

  it('movePhoto and movePhotoToIndex work', () => {
    expect(movePhoto(ids, 2, 0)).toEqual(['g2', 'hero', 'g1', 'g3']);
    expect(movePhotoToIndex(ids, 'g2', 0)).toEqual(['g2', 'hero', 'g1', 'g3']);
  });
});
