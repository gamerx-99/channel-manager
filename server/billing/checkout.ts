import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError } from '../db/utils';
import {
  computePeriodEnd,
  computeTrialEnd,
  planForRoomCount,
  planPrice,
  type BillingCycle,
} from '@shared/billing/planCatalog';
import type { SubscriptionRecord } from '@shared/billing/subscriptionAccess';
import type { SubscriptionRow } from './subscriptionDb';

export type CheckoutRequest = {
  hotelId: string;
  planCode: string;
  billingCycle: BillingCycle;
};

export type CheckoutResult = {
  plan_code: string;
  billing_cycle: BillingCycle;
  amount: number;
  tier_rooms: number;
  period_end: string;
  reference: string;
};

function toRecord(row: SubscriptionRow): SubscriptionRecord {
  return {
    status: row.status as SubscriptionRecord['status'],
    periodEnd: row.period_end,
    trialEndsAt: row.trial_ends_at,
    planCode: row.plan_code,
    tierRooms: Number(row.tier_rooms),
  };
}

/**
 * Resolve what a hotel would pay for a plan, based on its CURRENT physical room
 * count. Two safeguards, both deliberate:
 *  - the amount comes from the `plans` table (source of truth), not the client;
 *  - the tier is derived from the room count, so a hotel cannot buy 'starter'
 *    while running 30 rooms and keep the cheaper price at renewal.
 */
export async function priceCheckout(
  client: SupabaseClient,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  const [{ count: roomCount, error: roomErr }, { data: plan, error: planErr }] = await Promise.all([
    client.from('rooms').select('id', { count: 'exact', head: true }).eq('hotel_id', request.hotelId),
    client.from('plans').select('code,max_rooms,price_monthly,price_yearly').eq('code', request.planCode).maybeSingle(),
  ]);
  throwOnError(roomErr);
  throwOnError(planErr);

  const rooms = roomCount ?? 0;
  if (!plan) {
    throw new Error(`Unknown plan code: ${request.planCode}`);
  }
  const maxRooms = Number((plan as { max_rooms: number }).max_rooms);
  if (rooms > maxRooms) {
    // Refuse rather than silently up-tiering: the guest chose a plan and the
    // mismatch is a UI/data problem worth surfacing.
    throw new Error(`Plan ${request.planCode} covers up to ${maxRooms} rooms but this hotel has ${rooms}.`);
  }

  const amount = Number(
    request.billingCycle === 'yearly'
      ? (plan as { price_yearly: number }).price_yearly
      : (plan as { price_monthly: number }).price_monthly,
  );
  const periodEnd = computePeriodEnd(new Date(), request.billingCycle);

  return {
    plan_code: request.planCode,
    billing_cycle: request.billingCycle,
    amount,
    tier_rooms: rooms,
    period_end: periodEnd.toISOString(),
    reference: buildPaymentReference(request.hotelId),
  };
}

/** PromptPay biller reference (max 25 chars per EMVCo tag 02). */
export function buildPaymentReference(hotelId: string): string {
  return `SUB-${hotelId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

/**
 * Mark a subscription as paid. Platform-only by design — see
 * subscriptions_platform_write in 20261017_saas_billing_schema.sql.
 *
 * `expectedStatus` guards against double-crediting the same payment: a renewal
 * that arrives after the row already moved to 'active' is a no-op rather than a
 * second paid period.
 */
export async function activateSubscription(
  client: SupabaseClient,
  input: {
    subscriptionId: string;
    reference: string;
    source: 'promptpay' | 'slipok' | 'manual';
    expectedStatus?: string;
  },
): Promise<SubscriptionRow> {
  const query = client
    .from('subscriptions')
    .update({
      status: 'active',
      verified_at: new Date().toISOString(),
      reference: input.reference,
      source: input.source,
    })
    .eq('id', input.subscriptionId);
  if (input.expectedStatus) query.eq('status', input.expectedStatus);

  const { data, error } = await query
    .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
    .maybeSingle();
  throwOnError(error);
  if (!data) {
    throw new Error('Subscription was not activated — it may already be active or the id is wrong.');
  }
  return data as SubscriptionRow;
}

/**
 * Open a trial for a brand-new tenant. Uses the room-count tier so the trial
 * starts on the plan the hotel will actually need to pay for.
 */
export async function startTrial(
  client: SupabaseClient,
  hotelId: string,
  trialDays: number,
): Promise<SubscriptionRow> {
  const { count: roomCount, error: roomErr } = await client
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId);
  throwOnError(roomErr);

  const rooms = roomCount ?? 0;
  const plan = planForRoomCount(rooms);
  const now = new Date();
  const trialEnd = computeTrialEnd(now, trialDays);

  const { data, error } = await client
    .from('subscriptions')
    .insert({
      hotel_id: hotelId,
      plan_code: plan.code,
      status: 'trialing',
      billing_cycle: 'monthly',
      tier_rooms: rooms,
      price_paid: 0,
      trial_ends_at: trialEnd.toISOString(),
      period_start: now.toISOString(),
      period_end: trialEnd.toISOString(),
      source: 'manual',
    })
    .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Trial subscription insert did not return a record.');
  return data as SubscriptionRow;
}

/**
 * Renew: extends the current period and re-prices at the hotel's CURRENT room
 * count, so growth at renewal moves the hotel to the tier it now needs.
 */
export async function renewSubscription(
  client: SupabaseClient,
  subscriptionId: string,
  billingCycle: BillingCycle,
  paidAmount: number,
  reference: string,
): Promise<SubscriptionRow> {
  const { data: current, error: readErr } = await client
    .from('subscriptions')
    .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
    .eq('id', subscriptionId)
    .maybeSingle();
  throwOnError(readErr);
  if (!current) throw new Error('Subscription not found.');
  const row = current as SubscriptionRow;

  const { count: roomCount, error: roomErr } = await client
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', row.hotel_id);
  throwOnError(roomErr);
  const rooms = roomCount ?? 0;
  const plan = planForRoomCount(rooms);
  const now = new Date();

  const { data, error } = await client
    .from('subscriptions')
    .update({
      plan_code: plan.code,
      status: 'active',
      billing_cycle: billingCycle,
      tier_rooms: rooms,
      price_paid: paidAmount,
      period_start: now.toISOString(),
      period_end: computePeriodEnd(now, billingCycle).toISOString(),
      verified_at: now.toISOString(),
      reference,
    })
    .eq('id', subscriptionId)
    .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Subscription renewal did not return a record.');
  return data as SubscriptionRow;
}

/** Operator-side suspension of the whole tenant (separate from payment state). */
export async function setHotelSuspended(
  client: SupabaseClient,
  hotelId: string,
  suspended: boolean,
): Promise<void> {
  const { error } = await client
    .from('hotels')
    .update({ suspended_at: suspended ? new Date().toISOString() : null })
    .eq('id', hotelId);
  throwOnError(error);
}

/**
 * Soft delete. Never removes the row: ร.ร.4 guest records must be retained at
 * least a year and bookings reference the hotel.
 */
export async function softDeleteHotel(client: SupabaseClient, hotelId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('hotels')
    .update({ deleted_at: now, suspended_at: now })
    .eq('id', hotelId);
  throwOnError(error);
}

export { planPrice };