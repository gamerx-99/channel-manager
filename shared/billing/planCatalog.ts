/**
 * SaaS plan catalogue — pure pricing/tier logic, no I/O.
 *
 * Tiering is by PHYSICAL ROOM COUNT (rooms table), not room_type count: a hotel
 * may have 3 room types and 40 physical rooms.
 *
 * ASSUMPTION: prices below mirror the seed rows in
 * 20261017_saas_billing_schema.sql and are placeholders pending owner
 * confirmation. The DB `plans` table is the source of truth at runtime; this
 * module exists so tier selection and period maths are unit-testable and so the
 * UI can render the tier ladder without a round trip.
 */

export type PlanCode = 'starter' | 'standard' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

export type PlanDefinition = {
  code: PlanCode;
  maxRooms: number;
  priceMonthly: number;
  priceYearly: number;
  nameTh: string;
  nameEn: string;
  sortOrder: number;
};

/** Ordered cheapest-first. `pro` is the open-ended ceiling. */
export const PLANS: readonly PlanDefinition[] = [
  {
    code: 'starter',
    maxRooms: 8,
    priceMonthly: 990,
    priceYearly: 9900,
    nameTh: 'เริ่มต้น (ไม่เกิน 8 ห้อง)',
    nameEn: 'Starter (up to 8 rooms)',
    sortOrder: 1,
  },
  {
    code: 'standard',
    maxRooms: 25,
    priceMonthly: 1990,
    priceYearly: 19900,
    nameTh: 'มาตรฐาน (ไม่เกิน 25 ห้อง)',
    nameEn: 'Standard (up to 25 rooms)',
    sortOrder: 2,
  },
  {
    code: 'pro',
    maxRooms: Number.MAX_SAFE_INTEGER,
    priceMonthly: 3990,
    priceYearly: 39900,
    nameTh: 'โปร (ไม่จำกัดห้อง)',
    nameEn: 'Pro (unlimited rooms)',
    sortOrder: 3,
  },
];

export const DEFAULT_TRIAL_DAYS = 14;

/** First plan whose ceiling covers `roomCount`; always resolves (pro is open). */
export function planForRoomCount(roomCount: number): PlanDefinition {
  const normalized = Number.isFinite(roomCount) ? Math.max(0, Math.floor(roomCount)) : 0;
  return (
    PLANS.find(plan => normalized <= plan.maxRooms) ??
    PLANS[PLANS.length - 1]
  );
}

export function getPlan(code: string): PlanDefinition | null {
  return PLANS.find(plan => plan.code === code) ?? null;
}

export function planPrice(plan: PlanDefinition, cycle: BillingCycle): number {
  return cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
}

/**
 * The next tier ABOVE the one that currently fits `roomCount` — i.e. the
 * upgrade a hotel must take when it has outgrown its current plan.
 * A 2-room hotel on starter is offered `standard`; a 12-room hotel already
 * needing `standard` is offered `pro`; a hotel that fits `pro` gets null.
 */
export function nextPlanAbove(roomCount: number): PlanDefinition | null {
  const current = planForRoomCount(roomCount);
  const index = PLANS.findIndex(plan => plan.code === current.code);
  return index >= 0 && index < PLANS.length - 1 ? PLANS[index + 1] : null;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86400000);
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Renewal period end. Monthly uses calendar months (not 30-day blocks) so a
 * hotel renewing on the 31st is not short-changed; yearly uses calendar years.
 */
export function computePeriodEnd(from: Date, cycle: BillingCycle): Date {
  return cycle === 'yearly' ? addMonths(from, 12) : addMonths(from, 1);
}

export function computeTrialEnd(from: Date, days: number = DEFAULT_TRIAL_DAYS): Date {
  return addDays(from, days);
}

/**
 * Whether the hotel has outgrown its purchased tier. Over-quota does NOT block
 * the hotel by itself — the hotel still keeps working until the renewal, at
 * which point `computePeriodEnd` is paid at the new tier. Surfaced so the
 * dashboard can prompt an upgrade instead of failing silently later.
 */
export function isOverTier(roomCount: number, planCode: string): boolean {
  const plan = getPlan(planCode);
  if (!plan) return true;
  return roomCount > plan.maxRooms;
}