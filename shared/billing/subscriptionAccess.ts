/**
 * SaaS subscription access rules — the single place that answers
 * "may this hotel take new work?".
 *
 * OWNER DECISION (2026-10-17): on non-payment the hotel loses NEW bookings but
 * keeps existing data readable and check-in/check-out working, because ร.ร.4 and
 * ตม.30 are statutory obligations that do not pause when a subscription lapses.
 *
 * Every enforcement point must call `canTakeNewBookings` (or
 * `subscriptionDecision` when it needs the reason for the UI) instead of
 * re-deriving the rule. server/db/booking.ts holdRoomType is the real gate;
 * mirror in public.hotel_is_active() at the DB layer.
 */

import { DEFAULT_TRIAL_DAYS } from './planCatalog';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionRecord = {
  status: SubscriptionStatus;
  periodEnd: string;
  trialEndsAt?: string | null;
  planCode?: string | null;
  /** Physical room count snapshot at purchase; tier bookkeeping only. */
  tierRooms?: number | null;
};

export type SubscriptionDecision =
  | { allowed: true; reason: 'trialing' | 'active' }
  | { allowed: false; reason: 'no_subscription' | 'trial_expired' | 'period_ended' | 'not_paying' | 'suspended' | 'deleted' };

/**
 * Statuses that still permit new bookings. `past_due` is deliberately absent:
 * a lapsed payment closes new bookings immediately (owner decision), while the
 * existing-data and check-in paths stay open regardless of status.
 */
const NEW_BOOKING_STATUSES: readonly SubscriptionStatus[] = ['trialing', 'active'];

function isLivePeriod(record: SubscriptionRecord, now: Date): boolean {
  const end = new Date(record.periodEnd).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

/**
 * Resolve whether a hotel may take a NEW booking.
 *
 * @param subscription the hotel's live subscription, or null when none exists
 * @param hotelLifecycle soft-lifecycle flags from `hotels`
 * @param now injectable for tests; defaults to the current time
 */
export function subscriptionDecision(
  subscription: SubscriptionRecord | null | undefined,
  hotelLifecycle: { suspendedAt?: string | null; deletedAt?: string | null } = {},
  now: Date = new Date(),
): SubscriptionDecision {
  if (hotelLifecycle.deletedAt) return { allowed: false, reason: 'deleted' };
  if (hotelLifecycle.suspendedAt) return { allowed: false, reason: 'suspended' };
  if (!subscription) return { allowed: false, reason: 'no_subscription' };

  if (!NEW_BOOKING_STATUSES.includes(subscription.status)) {
    return { allowed: false, reason: 'not_paying' };
  }
  if (!isLivePeriod(subscription, now)) {
    // A trialing row past its trial is an expired trial, not a lapsed payment;
    // the dashboard wording differs.
    const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : NaN;
    return {
      allowed: false,
      reason: subscription.status === 'trialing' && Number.isFinite(trialEnd) && trialEnd <= now.getTime()
        ? 'trial_expired'
        : 'period_ended',
    };
  }
  return { allowed: true, reason: subscription.status === 'trialing' ? 'trialing' : 'active' };
}

export function canTakeNewBookings(
  subscription: SubscriptionRecord | null | undefined,
  hotelLifecycle: { suspendedAt?: string | null; deletedAt?: string | null } = {},
  now: Date = new Date(),
): boolean {
  return subscriptionDecision(subscription, hotelLifecycle, now).allowed;
}

/**
 * Existing-data access (bookings list, calendar, financials, statutory export).
 * Deliberately NOT gated on subscription status — a lapsed hotel must still be
 * able to run arrivals and ร.ร.4 reporting.
 */
export function canAccessExistingData(
  hotelLifecycle: { deletedAt?: string | null } = {},
): boolean {
  return !hotelLifecycle.deletedAt;
}

/**
 * Trial row for a brand-new tenant. periodEnd == trialEndsAt so the same
 * liveness check covers both.
 */
export function buildTrialSubscription(
  planCode: string,
  tierRooms: number,
  now: Date = new Date(),
  trialDays: number = DEFAULT_TRIAL_DAYS,
): SubscriptionRecord {
  const trialEnd = new Date(now.getTime() + trialDays * 86400000).toISOString();
  return {
    status: 'trialing',
    planCode,
    tierRooms,
    periodEnd: trialEnd,
    trialEndsAt: trialEnd,
  };
}