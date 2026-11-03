import { describe, expect, it } from "vitest";
import {
  CouponError,
  PRO_MONTHLY_PRICE,
  TRIAL_DAYS,
  extendPaidUntil,
  quotePro,
  resolvePlan,
  type PlanCoupon,
} from "./plans";

const date = (value: string) => new Date(value);

describe("resolvePlan", () => {
  it("keeps trial active until its exact end, then falls back to Free", () => {
    const ownerCreatedAt = date("2026-11-01T00:00:00.000Z");
    const now = date("2026-11-15T23:59:59.999Z");
    const lastMoment = resolvePlan({ ownerCreatedAt, paidUntil: null, now });

    expect(lastMoment.plan).toBe("trial");
    expect(lastMoment.endsAt?.getTime()).toBe(ownerCreatedAt.getTime() + TRIAL_DAYS * 86_400_000);
    expect(lastMoment.daysLeft).toBe(1);
    expect(resolvePlan({ ownerCreatedAt, paidUntil: null, now: date("2026-11-16T00:00:00.000Z") }))
      .toEqual({ plan: "free", endsAt: null, daysLeft: 0 });
  });

  it("prioritizes paid Pro and starts the paid period after the trial when payment occurs during trial", () => {
    const ownerCreatedAt = date("2026-11-01T00:00:00.000Z");
    const now = date("2026-11-05T00:00:00.000Z");
    const paidUntil = date("2026-12-16T00:00:00.000Z");
    expect(resolvePlan({ ownerCreatedAt, paidUntil, now }).plan).toBe("pro");
    expect(extendPaidUntil({ paidUntil: null, trialEndsAt: date("2026-11-16T00:00:00.000Z"), now, months: 1 }))
      .toEqual(date("2026-12-16T00:00:00.000Z"));
  });

  it("does not extend days away while Pro is active", () => {
    const paidUntil = date("2026-12-31T09:00:00.000Z");
    expect(extendPaidUntil({
      paidUntil,
      trialEndsAt: date("2026-11-16T09:00:00.000Z"),
      now: date("2026-11-20T09:00:00.000Z"),
      months: 1,
    })).toEqual(date("2027-01-31T09:00:00.000Z"));
  });
});

describe("quotePro", () => {
  const coupon = (overrides: Partial<PlanCoupon> = {}): PlanCoupon => ({
    percentOff: 50,
    discountMonths: 1,
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    redemptionCount: 0,
    ...overrides,
  });
  const now = date("2026-11-04T00:00:00.000Z");

  it("discounts only the coupon's covered months", () => {
    expect(quotePro({ months: 3, coupon: coupon({ discountMonths: 1 }), now, alreadyRedeemed: false }))
      .toEqual({ listAmount: 897, discountAmount: 149.5, amount: 747.5 });
  });

  it("supports a 100% coupon", () => {
    expect(quotePro({ months: 3, coupon: coupon({ percentOff: 100, discountMonths: 3 }), now, alreadyRedeemed: false }))
      .toEqual({ listAmount: PRO_MONTHLY_PRICE * 3, discountAmount: PRO_MONTHLY_PRICE * 3, amount: 0 });
  });

  it.each([
    ["inactive", coupon({ active: false }), false, "coupon_inactive"],
    ["expired", coupon({ expiresAt: date("2026-11-04T00:00:00.000Z") }), false, "coupon_expired"],
    ["used up", coupon({ maxRedemptions: 2, redemptionCount: 2 }), false, "coupon_used_up"],
    ["already redeemed by this hotel", coupon(), true, "coupon_already_redeemed"],
  ] as const)("rejects a %s coupon with its own error code", (_label, value, alreadyRedeemed, code) => {
    expect(() => quotePro({ months: 1, coupon: value, now, alreadyRedeemed }))
      .toThrowError(expect.objectContaining({ code }));
    try {
      quotePro({ months: 1, coupon: value, now, alreadyRedeemed });
    } catch (error) {
      expect(error).toBeInstanceOf(CouponError);
      expect((error as CouponError).code).toBe(code);
    }
  });
});
