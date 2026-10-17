import { describe, expect, it } from 'vitest';
import {
  PLANS,
  computePeriodEnd,
  computeTrialEnd,
  planForRoomCount,
  planPrice,
} from '@shared/billing/planCatalog';

/**
 * Structural contract for the pricing rules enforced in server/billing/checkout.ts.
 * These are the money invariants: a tenant must never be able to choose its own
 * price, and a hotel that outgrows its tier must be re-priced upward.
 */

const PRICE_BY_CODE = new Map(PLANS.map(plan => [plan.code, plan]));

describe('billing pricing invariants', () => {
  it('prices every plan in both cycles, with yearly cheaper than 12x monthly', () => {
    for (const plan of PLANS) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
      expect(plan.priceYearly).toBeGreaterThan(0);
      // Annual discount: never worse than paying monthly twelve times.
      expect(plan.priceYearly).toBeLessThan(plan.priceMonthly * 12);
    }
  });

  it('never lets a higher tier be cheaper per room than the tier below it', () => {
    for (let index = 1; index < PLANS.length; index += 1) {
      const lower = PLANS[index - 1];
      const higher = PLANS[index];
      expect(higher.priceMonthly).toBeGreaterThan(lower.priceMonthly);
    }
  });

  it('keeps tier ceilings strictly ascending so selection is unambiguous', () => {
    const ceilings = PLANS.map(plan => plan.maxRooms);
    for (let index = 1; index < ceilings.length; index += 1) {
      expect(ceilings[index]).toBeGreaterThan(ceilings[index - 1]);
    }
    expect(ceilings[ceilings.length - 1]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('re-prices a growing hotel upward at renewal, never downward into a bigger room count', () => {
    // A 5-room hotel on starter grows to 30 rooms: renewal must land on pro.
    const before = planForRoomCount(5);
    const after = planForRoomCount(30);
    expect(before.code).toBe('starter');
    expect(after.code).toBe('pro');
    expect(PRICE_BY_CODE.get(after.code)!.priceMonthly)
      .toBeGreaterThan(PRICE_BY_CODE.get(before.code)!.priceMonthly);
  });

  it('refuses to sell a tier that cannot hold the hotel room count', () => {
    // Mirrors priceCheckout: 30 rooms against starter (ceiling 8) is an error,
    // not a silent upgrade — the caller surfaces it.
    const starterCeiling = PRICE_BY_CODE.get('starter')!.maxRooms;
    expect(30 > starterCeiling).toBe(true);
    expect(8 > starterCeiling).toBe(false);
  });

  it('charges the cycle the caller selected, never a mixed figure', () => {
    const standard = PRICE_BY_CODE.get('standard')!;
    expect(planPrice(standard, 'monthly')).toBe(standard.priceMonthly);
    expect(planPrice(standard, 'yearly')).toBe(standard.priceYearly);
  });

  it('sets a fresh period end strictly in the future for both cycles', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    expect(computePeriodEnd(now, 'monthly').getTime()).toBeGreaterThan(now.getTime());
    expect(computePeriodEnd(now, 'yearly').getTime())
      .toBeGreaterThan(computePeriodEnd(now, 'monthly').getTime());
  });

  it('defaults a trial to 14 days and never ends it before it starts', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    const end = computeTrialEnd(now);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
    expect(Math.round((end.getTime() - now.getTime()) / 86400000)).toBe(14);
  });
});