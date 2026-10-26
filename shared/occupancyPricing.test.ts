import { describe, expect, it } from 'vitest';
import {
  calculateStayOccupancyPrice,
  classifyGuests,
  defaultChildRateConfig,
  defaultOccupancyPricing,
  fitsOccupancy,
  getRoomTypePricingValidationError,
  type OccupancyPricingRules,
} from './occupancyPricing';

const rules: OccupancyPricingRules = {
  base_occupancy: 2,
  max_occupancy: 4,
  occupancy_pricing: {
    '1': { enabled: true, mode: 'percent', value: -10 },
    '2': { enabled: true, mode: 'percent', value: 0 },
    '3': { enabled: true, mode: 'percent', value: 15 },
    '4': { enabled: true, mode: 'percent', value: 30 },
  },
  child_rule: 'age',
  child_rule_limit: null,
  child_rates: {
    infant: { mode: 'free', value: 0 },
    age_groups: [
      { min_age: 3, max_age: 7, mode: 'fixed', value: 100 },
      { min_age: 8, max_age: 17, mode: 'percent', value: 10 },
    ],
    height: { mode: 'free', value: 0 },
  },
  children_count_toward_max: true,
};

describe('occupancy pricing by total guest count', () => {
  it('applies each level as an adjustment to that night’s normal base-occupancy rate', () => {
    expect(calculateStayOccupancyPrice({ nightlyRates: [1000, 1200], rules, totalGuestCount: 3, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } }))
      .toEqual({ nightlyPrices: [1150, 1380], totalPrice: 2530 });
    expect(calculateStayOccupancyPrice({ nightlyRates: [1000], rules, totalGuestCount: 4, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } }).totalPrice).toBe(1300);
    expect(calculateStayOccupancyPrice({ nightlyRates: [1000], rules, totalGuestCount: 1, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } }).totalPrice).toBe(900);
  });

  it('applies a fixed THB difference to each nightly override and rejects a negative net room price', () => {
    const fixedRules = { ...rules, occupancy_pricing: { ...rules.occupancy_pricing, '1': { enabled: true, mode: 'fixed' as const, value: -100 }, '3': { enabled: true, mode: 'fixed' as const, value: 250 } } };
    expect(calculateStayOccupancyPrice({ nightlyRates: [1000, 1500], rules: fixedRules, totalGuestCount: 3, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } }).nightlyPrices).toEqual([1250, 1750]);
    expect(() => calculateStayOccupancyPrice({ nightlyRates: [50], rules: fixedRules, totalGuestCount: 1, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } })).toThrow('Total price cannot be negative after adjustments');
  });

  it('does not book an occupancy level that the owner has turned off', () => {
    const disabled = { ...rules, occupancy_pricing: { ...rules.occupancy_pricing, '3': { ...rules.occupancy_pricing['3'], enabled: false } } };
    expect(fitsOccupancy(disabled, 3, 0, 0)).toBe(false);
    expect(() => calculateStayOccupancyPrice({ nightlyRates: [1000], rules: disabled, totalGuestCount: 3, childRateCounts: { infant: 0, age_groups: [0, 0], height: 0 } })).toThrow('not bookable');
  });

  it('counts infants and configured age groups as children, and unmatched ages as adults', () => {
    const classified = classifyGuests([{ age: 2 }, { age: 5 }, { age: 11 }, { age: 18 }], rules);
    expect(classified).toEqual({
      qualifyingChildren: 3,
      adultEquivalentCount: 1,
      childRateCounts: { infant: 1, age_groups: [1, 1], height: 0 },
    });
  });

  it('prices infant and configured age groups with their per-night rates', () => {
    const stay = calculateStayOccupancyPrice({
      nightlyRates: [1000, 1200],
      rules,
      totalGuestCount: 4,
      childRateCounts: { infant: 1, age_groups: [1, 1], height: 0 },
    });
    expect(stay.nightlyPrices).toEqual([1500, 1780]);
  });

  it('uses the single configured height boundary and rate when height mode is selected', () => {
    const heightRules = { ...rules, child_rule: 'height' as const, child_rule_limit: 140 };
    expect(classifyGuests([{ height_cm: 120 }, { height_cm: 150 }], heightRules)).toEqual({
      qualifyingChildren: 1,
      adultEquivalentCount: 1,
      childRateCounts: { infant: 0, age_groups: [0, 0], height: 1 },
    });
  });
});

describe('owner pricing validation', () => {
  it('requires all occupancy levels and valid adjustment direction', () => {
    expect(getRoomTypePricingValidationError({ ...rules, occupancy_pricing: { '2': rules.occupancy_pricing['2'] } })).toContain('each guest count');
    expect(getRoomTypePricingValidationError({ ...rules, occupancy_pricing: { ...rules.occupancy_pricing, '3': { enabled: true, mode: 'percent', value: -10 } } })).toContain('wrong direction');
  });

  it('requires age groups to begin at 3 and remain contiguous, but permits ending before 17', () => {
    const child_rates = { ...rules.child_rates, age_groups: [
      { min_age: 3, max_age: 7, mode: 'free' as const, value: 0 },
      { min_age: 9, max_age: 12, mode: 'free' as const, value: 0 },
    ] };
    expect(getRoomTypePricingValidationError({ ...rules, child_rates })).toContain('contiguous');
    expect(getRoomTypePricingValidationError({ ...rules, child_rates: { ...child_rates, age_groups: [{ ...child_rates.age_groups[0], min_age: 4 }] } })).toContain('start at age 3');
    expect(getRoomTypePricingValidationError({ ...rules, child_rates: { ...rules.child_rates, age_groups: [{ min_age: 3, max_age: 10, mode: 'free', value: 0 }] } })).toBeNull();
  });

  it('provides free defaults for the fixed infant band and optional age/height rates', () => {
    expect(defaultChildRateConfig()).toEqual({ infant: { mode: 'free', value: 0 }, age_groups: [], height: { mode: 'free', value: 0 } });
    expect(defaultOccupancyPricing(2, 4)).toEqual({
      '1': { enabled: false, mode: 'percent', value: 0 },
      '2': { enabled: true, mode: 'percent', value: 0 },
      '3': { enabled: false, mode: 'percent', value: 0 },
      '4': { enabled: false, mode: 'percent', value: 0 },
    });
  });
});
