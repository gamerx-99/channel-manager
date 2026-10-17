import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIAL_DAYS,
  PLANS,
  computePeriodEnd,
  computeTrialEnd,
  getPlan,
  isOverTier,
  nextPlanAbove,
  planForRoomCount,
  planPrice,
} from './planCatalog';

describe('planCatalog', () => {
  it('tiers by physical room count with ascending ceilings', () => {
    expect(planForRoomCount(1).code).toBe('starter');
    expect(planForRoomCount(8).code).toBe('starter');
    expect(planForRoomCount(9).code).toBe('standard');
    expect(planForRoomCount(25).code).toBe('standard');
    expect(planForRoomCount(26).code).toBe('pro');
    expect(planForRoomCount(5000).code).toBe('pro');
  });

  it('treats a zero-room and a nonsense room count as the entry tier', () => {
    expect(planForRoomCount(0).code).toBe('starter');
    expect(planForRoomCount(-3).code).toBe('starter');
    expect(planForRoomCount(Number.NaN).code).toBe('starter');
  });

  it('always resolves a plan because the top tier is open-ended', () => {
    const top = PLANS[PLANS.length - 1];
    expect(top.maxRooms).toBe(Number.MAX_SAFE_INTEGER);
    expect(planForRoomCount(1e12).code).toBe(top.code);
  });

  it('floors fractional room counts', () => {
    expect(planForRoomCount(8.9).code).toBe('starter');
    expect(planForRoomCount(25.9).code).toBe('standard');
    expect(planForRoomCount(26).code).toBe('pro');
  });

  it('returns null for an unknown plan code instead of throwing', () => {
    expect(getPlan('enterprise')).toBeNull();
    expect(getPlan('starter')?.maxRooms).toBe(8);
  });

  it('charges the yearly price only for the yearly cycle', () => {
    const starter = getPlan('starter')!;
    expect(planPrice(starter, 'monthly')).toBe(990);
    expect(planPrice(starter, 'yearly')).toBe(9900);
  });

  it('offers the tier above the one that currently fits', () => {
    // 2 rooms fits starter -> the upgrade on offer is standard.
    expect(nextPlanAbove(2)?.code).toBe('standard');
    // 12 rooms already needs standard -> the upgrade on offer is pro.
    expect(nextPlanAbove(12)?.code).toBe('pro');
    // Already on the open-ended tier.
    expect(nextPlanAbove(30)).toBeNull();
  });

  it('renews on calendar boundaries, not fixed 30-day blocks', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    expect(computePeriodEnd(jan31, 'monthly').toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(computePeriodEnd(new Date('2026-01-15T00:00:00.000Z'), 'yearly').toISOString())
      .toBe('2027-01-15T00:00:00.000Z');
  });

  it('ends the trial DEFAULT_TRIAL_DAYS after it starts', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    expect(computeTrialEnd(start).toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(DEFAULT_TRIAL_DAYS).toBe(14);
  });

  it('flags an over-quota hotel without blocking it', () => {
    expect(isOverTier(30, 'starter')).toBe(true);
    expect(isOverTier(8, 'starter')).toBe(false);
    expect(isOverTier(999, 'pro')).toBe(false);
    // An unknown plan is treated as non-compliant so the caller prompts.
    expect(isOverTier(1, 'enterprise')).toBe(true);
  });
});