import { describe, expect, it, vi } from 'vitest';
import { deleteRateOverride } from './availability';

describe('deleteRateOverride hotel scoping', () => {
  it('returns null without deleting when the override belongs to another hotel', async () => {
    let deleteCalled = false;
    const client = {
      from: (table: string) => {
        if (table === 'rate_overrides') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'ov-1', room_type_id: 'rt-1' }, error: null }) }) }),
            delete: () => {
              deleteCalled = true;
              return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'ov-1' }, error: null }) }) }) };
            },
          };
        }
        if (table === 'room_types') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { hotel_id: 'other-hotel' }, error: null }) }) }),
          };
        }
        return {};
      },
    } as any;

    const result = await deleteRateOverride(client, 'ov-1', 'home-hotel');
    expect(result).toBeNull();
    expect(deleteCalled).toBe(false);
  });
});