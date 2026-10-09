import { describe, expect, it } from 'vitest';
import { calculateStayOccupancyPrice, classifyGuests, fitsOccupancy } from './occupancyPricing';

const rules = {
  base_occupancy: 2,
  max_occupancy: 5,
  extra_guest_mode: 'tiered_percent' as const,
  extra_guest_amount: 0,
  extra_guest_tier_percents: [25, 50, 75],
  child_price_mode: 'free' as const,
  child_price_value: 0,
  children_count_toward_max: true,
};

describe('occupancy pricing', () => {
  it('prices each extra adult by its tier percentage of that night rate', () => {
    expect(calculateStayOccupancyPrice({
      nightlyRates: [1000, 1200], rules, adults: 4, qualifyingChildren: 0,
    })).toEqual({ nightlyPrices: [1750, 2100], totalPrice: 3850 });
  });

  it('applies fixed and percentage child prices per child and night', () => {
    expect(calculateStayOccupancyPrice({
      nightlyRates: [1000, 1000],
      rules: { ...rules, extra_guest_mode: 'per_person', extra_guest_amount: 200, child_price_mode: 'fixed', child_price_value: 100 },
      adults: 3,
      qualifyingChildren: 2,
    }).totalPrice).toBe(2800);
    expect(calculateStayOccupancyPrice({
      nightlyRates: [1000],
      rules: { ...rules, child_price_mode: 'percent', child_price_value: 10 },
      adults: 2,
      qualifyingChildren: 2,
    }).totalPrice).toBe(1200);
  });

  it('classifies a child over the configured age or height limit as an adult', () => {
    expect(classifyGuests([{ age: 10 }, { age: 13 }], { child_rule: 'age', child_rule_limit: 12 }))
      .toEqual({ qualifyingChildren: 1, adultEquivalentCount: 1 });
    expect(classifyGuests([{ height_cm: 120 }, { height_cm: 151 }], { child_rule: 'height', child_rule_limit: 150 }))
      .toEqual({ qualifyingChildren: 1, adultEquivalentCount: 1 });
  });

  it('treats children as adults until the owner configures a child limit', () => {
    expect(classifyGuests([{ age: 4 }, { age: 9 }], { child_rule: 'age', child_rule_limit: null }))
      .toEqual({ qualifyingChildren: 0, adultEquivalentCount: 2 });
  });

  it('uses the per-room-type occupancy limit and child-count setting', () => {
    expect(fitsOccupancy(rules, 3, 2, 0)).toBe(true);
    expect(fitsOccupancy(rules, 4, 2, 0)).toBe(false);
    expect(fitsOccupancy({ ...rules, children_count_toward_max: false }, 4, 2, 0)).toBe(true);
  });
});
