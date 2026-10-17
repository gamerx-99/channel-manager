import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, isMissingTableError } from '../db/utils';
import {
  canTakeNewBookings,
  subscriptionDecision,
  type SubscriptionDecision,
  type SubscriptionRecord,
} from '@shared/billing/subscriptionAccess';

export type SubscriptionRow = {
  id: string;
  hotel_id: string;
  plan_code: string;
  status: string;
  billing_cycle: string;
  tier_rooms: number | string;
  price_paid: number | string;
  trial_ends_at: string | null;
  period_start: string | null;
  period_end: string;
  source: string | null;
  reference: string | null;
  verified_at: string | null;
  cancelled_at: string | null;
};

export type HotelLifecycleRow = {
  suspended_at: string | null;
  deleted_at: string | null;
};

export type HotelBillingState = {
  subscription: SubscriptionRecord | null;
  lifecycle: { suspendedAt: string | null; deletedAt: string | null };
  decision: SubscriptionDecision;
};

function toSubscriptionRecord(row: SubscriptionRow | null): SubscriptionRecord | null {
  if (!row) return null;
  return {
    status: row.status as SubscriptionRecord['status'],
    periodEnd: row.period_end,
    trialEndsAt: row.trial_ends_at,
    planCode: row.plan_code,
    tierRooms: Number(row.tier_rooms),
  };
}

/**
 * The hotel's live subscription (trialing/active/past_due), or null.
 *
 * Called from the PUBLIC booking path (holdRoomType), so it must degrade
 * gracefully before the owner applies 20261017_saas_billing_schema.sql:
 * a missing table returns null, and the caller's decision rule then denies
 * new bookings for hotels with no subscription. That is the safe direction —
 * fail closed on money, never open.
 */
export async function getLiveSubscription(
  client: SupabaseClient,
  hotelId: string,
): Promise<SubscriptionRecord | null> {
  try {
    const { data, error } = await client
      .from('subscriptions')
      .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
      .eq('hotel_id', hotelId)
      .in('status', ['trialing', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingTableError('subscriptions', error)) return null;
      throw error;
    }
    return toSubscriptionRecord((data ?? null) as SubscriptionRow | null);
  } catch (error) {
    if (isMissingTableError('subscriptions', error)) return null;
    throw error;
  }
}

/**
 * Raw live-subscription row (with its `id`), for operator actions that need to
 * address the row. Prefer getLiveSubscription where the id is not needed.
 */
export async function getLiveSubscriptionRow(
  client: SupabaseClient,
  hotelId: string,
): Promise<SubscriptionRow | null> {
  try {
    const { data, error } = await client
      .from('subscriptions')
      .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
      .eq('hotel_id', hotelId)
      .in('status', ['trialing', 'active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingTableError('subscriptions', error)) return null;
      throw error;
    }
    return (data ?? null) as SubscriptionRow | null;
  } catch (error) {
    if (isMissingTableError('subscriptions', error)) return null;
    throw error;
  }
}

/** Reads the soft-lifecycle flags added in 20261017_saas_billing_schema.sql. */
export async function getHotelLifecycle(
  client: SupabaseClient,
  hotelId: string,
): Promise<HotelLifecycleRow> {
  const EMPTY: HotelLifecycleRow = { suspended_at: null, deleted_at: null };
  try {
    const { data, error } = await client
      .from('hotels')
      .select('suspended_at,deleted_at')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError('hotels', error)) return EMPTY;
      throw error;
    }
    if (!data) return EMPTY;
    const row = data as { suspended_at?: string | null; deleted_at?: string | null };
    return { suspended_at: row.suspended_at ?? null, deleted_at: row.deleted_at ?? null };
  } catch (error) {
    if (isMissingTableError('hotels', error)) return EMPTY;
    throw error;
  }
}

/** Physical room count — the tier input (rooms, not room_types). */
export async function countHotelRooms(client: SupabaseClient, hotelId: string): Promise<number> {
  const { count, error } = await client
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId);
  throwOnError(error);
  return count ?? 0;
}

/**
 * Single call used by every enforcement point. Resolves the hotel's billing
 * state and the resulting new-booking decision in one shape.
 *
 * `super_adminAccess` lets platform staff work on a hotel that has lapsed
 * (support/debugging) — mirrors `is_super_admin()` inside hotel_is_active().
 */
export async function resolveHotelBillingState(
  client: SupabaseClient,
  hotelId: string,
  options: { now?: Date; isPlatformSuperAdmin?: boolean } = {},
): Promise<HotelBillingState> {
  const [subscription, lifecycle] = await Promise.all([
    getLiveSubscription(client, hotelId),
    getHotelLifecycle(client, hotelId),
  ]);
  const decision = options.isPlatformSuperAdmin
    ? { allowed: true as const, reason: 'active' as const }
    : subscriptionDecision(
        subscription,
        { suspendedAt: lifecycle.suspended_at, deletedAt: lifecycle.deleted_at },
        options.now,
      );
  return {
    subscription,
    lifecycle: { suspendedAt: lifecycle.suspended_at, deletedAt: lifecycle.deleted_at },
    decision,
  };
}

/** Convenience predicate over resolveHotelBillingState. */
export async function hotelCanTakeNewBookings(
  client: SupabaseClient,
  hotelId: string,
  options: { now?: Date; isPlatformSuperAdmin?: boolean } = {},
): Promise<boolean> {
  const state = await resolveHotelBillingState(client, hotelId, options);
  return canTakeNewBookings(state.subscription, state.lifecycle, options.now);
}

/** Public plan ladder for the pricing page (no auth needed). */
export async function listPlans(client: SupabaseClient) {
  try {
    const { data, error } = await client
      .from('plans')
      .select('code,max_rooms,price_monthly,price_yearly,name_th,name_en,sort_order')
      .order('sort_order', { ascending: true });
    if (error) {
      if (isMissingTableError('plans', error)) return [];
      throw error;
    }
    return data ?? [];
  } catch (error) {
    if (isMissingTableError('plans', error)) return [];
    throw error;
  }
}