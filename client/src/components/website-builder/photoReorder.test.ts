import { describe, expect, it } from 'vitest';
import { reorderPhotoIds, movePhoto, movePhotoToIndex } from './photoReorder';

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
