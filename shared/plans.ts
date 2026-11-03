export const PRO_MONTHLY_PRICE = 299;
export const TRIAL_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ResolvedPlan = {
  plan: "trial" | "pro" | "free";
  endsAt: Date | null;
  daysLeft: number;
};

export function resolvePlan({
  ownerCreatedAt,
  paidUntil,
  now,
}: {
  ownerCreatedAt: Date;
  paidUntil: Date | null;
  now: Date;
}): ResolvedPlan {
  if (paidUntil && paidUntil.getTime() > now.getTime()) {
    return { plan: "pro", endsAt: paidUntil, daysLeft: Math.ceil((paidUntil.getTime() - now.getTime()) / DAY_MS) };
  }

  const trialEndsAt = new Date(ownerCreatedAt.getTime() + TRIAL_DAYS * DAY_MS);
  if (now.getTime() < trialEndsAt.getTime()) {
    return { plan: "trial", endsAt: trialEndsAt, daysLeft: Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS) };
  }

  return { plan: "free", endsAt: null, daysLeft: 0 };
}

export type PlanCoupon = {
  percentOff: number;
  discountMonths: number;
  active: boolean;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
};

export type CouponErrorCode = "coupon_inactive" | "coupon_expired" | "coupon_used_up" | "coupon_already_redeemed";

export class CouponError extends Error {
  constructor(readonly code: CouponErrorCode) {
    super(code);
    this.name = "CouponError";
  }
}

export function quotePro({
  months,
  coupon,
  now,
  alreadyRedeemed,
}: {
  months: number;
  coupon: PlanCoupon | null;
  now: Date;
  alreadyRedeemed: boolean;
}): { listAmount: number; discountAmount: number; amount: number } {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a positive integer");

  const listAmount = roundMoney(PRO_MONTHLY_PRICE * months);
  if (!coupon) return { listAmount, discountAmount: 0, amount: listAmount };
  if (!coupon.active) throw new CouponError("coupon_inactive");
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) throw new CouponError("coupon_expired");
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) throw new CouponError("coupon_used_up");
  if (alreadyRedeemed) throw new CouponError("coupon_already_redeemed");

  const discountedMonths = Math.min(months, coupon.discountMonths);
  const discountAmount = roundMoney(PRO_MONTHLY_PRICE * discountedMonths * coupon.percentOff / 100);
  return { listAmount, discountAmount, amount: roundMoney(listAmount - discountAmount) };
}

export function extendPaidUntil({
  paidUntil,
  trialEndsAt,
  now,
  months,
}: {
  paidUntil: Date | null;
  trialEndsAt: Date;
  now: Date;
  months: number;
}): Date {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a positive integer");
  const startsAt = Math.max(now.getTime(), paidUntil?.getTime() ?? -Infinity, trialEndsAt.getTime());
  const end = new Date(startsAt);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return end;
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
