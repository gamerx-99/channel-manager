import { describe, expect, it } from 'vitest';
import { createRoomTypeSchema, updateRoomTypeSchema } from './routers/hotelRouter';

const baseInput = {
  hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
  name: 'Family Room',
  capacity: 4,
  base_occupancy: 2,
  max_occupancy: 4,
  base_price: 1000,
  quantity: 1,
  occupancy_pricing: {
    '1': { enabled: true, mode: 'percent' as const, value: -10 },
    '2': { enabled: true, mode: 'percent' as const, value: 0 },
    '3': { enabled: true, mode: 'percent' as const, value: 15 },
    '4': { enabled: true, mode: 'percent' as const, value: 30 },
  },
  child_rule: 'age' as const,
  child_rates: {
    infant: { mode: 'free' as const, value: 0 },
    age_groups: [
      { min_age: 3, max_age: 7, mode: 'fixed' as const, value: 100 },
      { min_age: 8, max_age: 17, mode: 'percent' as const, value: 10 },
    ],
    height: { mode: 'free' as const, value: 0 },
  },
};

describe('room type pricing save validation', () => {
  it('accepts a complete per-occupancy schedule and contiguous child age groups', () => {
    expect(createRoomTypeSchema.safeParse(baseInput).success).toBe(true);
  });

  it('rejects missing occupancy levels and adjustments with the wrong direction', () => {
    const missingLevel = { ...baseInput, occupancy_pricing: { '1': baseInput.occupancy_pricing['1'] } };
    expect(createRoomTypeSchema.safeParse(missingLevel).success).toBe(false);
    const wrongDirection = { ...baseInput, occupancy_pricing: { ...baseInput.occupancy_pricing, '3': { enabled: true, mode: 'fixed' as const, value: -50 } } };
    expect(createRoomTypeSchema.safeParse(wrongDirection).success).toBe(false);
  });

  it('rejects gaps in child age groups and a height rule with no threshold', () => {
    const gap = { ...baseInput, child_rates: { ...baseInput.child_rates, age_groups: [
      baseInput.child_rates.age_groups[0],
      { ...baseInput.child_rates.age_groups[1], min_age: 9 },
    ] } };
    expect(createRoomTypeSchema.safeParse(gap).success).toBe(false);
    const missingHeightLimit = { ...baseInput, child_rule: 'height' as const };
    expect(createRoomTypeSchema.safeParse(missingHeightLimit).success).toBe(false);
  });

  it('applies the same validation to room type updates', () => {
    const update = { ...baseInput, room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111' };
    expect(updateRoomTypeSchema.safeParse(update).success).toBe(true);
    expect(updateRoomTypeSchema.safeParse({ ...update, occupancy_pricing: { '2': baseInput.occupancy_pricing['2'] } }).success).toBe(false);
  });

  it('requires a complete pricing schedule when an update changes occupancy limits', () => {
    const { occupancy_pricing: _occupancyPricing, child_rates: _childRates, ...updateWithoutPricing } = {
      ...baseInput,
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
      base_occupancy: 1,
    };
    expect(updateRoomTypeSchema.safeParse(updateWithoutPricing).success).toBe(false);
  });
});
