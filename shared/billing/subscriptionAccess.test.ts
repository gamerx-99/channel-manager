import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  buildTrialSubscription,
  canAccessExistingData,
  canTakeNewBookings,
  subscriptionDecision,
} from './subscriptionAccess';

const NOW = new Date('2026-06-15T00:00:00.000Z');
const FUTURE = '2026-07-15T00:00:00.000Z';
const PAST = '2026-05-15T00:00:00.000Z';

const trialing = { status: 'trialing' as const, periodEnd: FUTURE, trialEndsAt: FUTURE };
const active = { status: 'active' as const, periodEnd: FUTURE };
const pastDue = { status: 'past_due' as const, periodEnd: FUTURE };
const cancelled = { status: 'cancelled' as const, periodEnd: FUTURE };
const expired = { status: 'expired' as const, periodEnd: PAST };

describe('subscriptionAccess', () => {
  it('allows new bookings while trialing or active', () => {
    expect(canTakeNewBookings(trialing, {}, NOW)).toBe(true);
    expect(canTakeNewBookings(active, {}, NOW)).toBe(true);
  });

  it('blocks new bookings the moment payment lapses', () => {
    expect(canTakeNewBookings(pastDue, {}, NOW)).toBe(false);
    expect(subscriptionDecision(pastDue, {}, NOW)).toEqual({ allowed: false, reason: 'not_paying' });
    expect(canTakeNewBookings(cancelled, {}, NOW)).toBe(false);
    expect(canTakeNewBookings(expired, {}, NOW)).toBe(false);
  });

  it('distinguishes an expired trial from a lapsed payment for the UI copy', () => {
    const overranTrial = { status: 'trialing' as const, periodEnd: PAST, trialEndsAt: PAST };
    expect(subscriptionDecision(overranTrial, {}, NOW)).toEqual({ allowed: false, reason: 'trial_expired' });
    const paidThenEnded = { status: 'active' as const, periodEnd: PAST };
    expect(subscriptionDecision(paidThenEnded, {}, NOW)).toEqual({ allowed: false, reason: 'period_ended' });
  });

  it('blocks a hotel with no subscription row at all', () => {
    expect(subscriptionDecision(null, {}, NOW)).toEqual({ allowed: false, reason: 'no_subscription' });
    expect(subscriptionDecision(undefined, {}, NOW).allowed).toBe(false);
  });

  it('lets a suspension or soft delete override an otherwise active plan', () => {
    expect(subscriptionDecision(active, { suspendedAt: '2026-06-01T00:00:00.000Z' }, NOW))
      .toEqual({ allowed: false, reason: 'suspended' });
    expect(subscriptionDecision(active, { deletedAt: '2026-06-01T00:00:00.000Z' }, NOW))
      .toEqual({ allowed: false, reason: 'deleted' });
  });

  it('treats the period boundary as exclusive: expired the instant it passes', () => {
    const endsExactlyNow = { status: 'active' as const, periodEnd: NOW.toISOString() };
    expect(canTakeNewBookings(endsExactlyNow, {}, NOW)).toBe(false);
    expect(canTakeNewBookings({ status: 'active', periodEnd: '2026-06-15T00:00:00.001Z' }, {}, NOW)).toBe(true);
  });

  // Owner decision: ร.ร.4 and ตม.30 are statutory and must not pause.
  it('keeps existing data readable regardless of payment status', () => {
    for (const record of [pastDue, cancelled, expired, null]) {
      expect(canAccessExistingData({})).toBe(true);
      expect(record).not.toBeUndefined();
    }
    // Only a soft delete closes historical access.
    expect(canAccessExistingData({ deletedAt: '2026-06-01T00:00:00.000Z' })).toBe(false);
  });

  it('builds a trial whose period end equals its trial end', () => {
    const trial = buildTrialSubscription('starter', 5, NOW);
    const trialEnd = new Date(trial.trialEndsAt).getTime();
    expect(trial.status).toBe('trialing');
    expect(trial.periodEnd).toBe(trial.trialEndsAt);
    expect(canTakeNewBookings(trial, {}, NOW)).toBe(true);
    // One millisecond past the trial end it stops allowing new bookings.
    expect(canTakeNewBookings(trial, {}, new Date(trialEnd + 1))).toBe(false);
  });

  it('covers every status the DB CHECK constraint allows', () => {
    expect(SUBSCRIPTION_STATUSES).toEqual(['trialing', 'active', 'past_due', 'cancelled', 'expired']);
  });
});