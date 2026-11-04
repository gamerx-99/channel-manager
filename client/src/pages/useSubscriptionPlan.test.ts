import { describe, expect, it } from "vitest";
import { billingErrorKey } from "./useSubscriptionPlan";
import th from "@/lib/i18n/th";
import en from "@/lib/i18n/en";

describe("billingErrorKey", () => {
  it.each([
    ["Coupon code is invalid.", "couponInvalid"],
    ["coupon_inactive", "couponInactive"],
    ["coupon_expired", "couponExpired"],
    ["coupon_used_up", "couponUsedUp"],
    ["coupon_already_redeemed", "couponAlreadyRedeemed"],
    ["Slip could not be verified.", "slipNotVerified"],
    ["Slip amount does not match the payment.", "slipAmountMismatch"],
    ["Payment QR has expired.", "qrExpired"],
    ["Payment is no longer pending.", "paymentNotPending"],
    ["Subscription payment system is not ready. Please contact hayhost.", "notReady"],
  ])("maps %s to a translated message in both languages", (message, key) => {
    expect(billingErrorKey(message)).toBe(key);
    expect((th as any).subscription[key]).toEqual(expect.any(String));
    expect((en as any).subscription[key]).toEqual(expect.any(String));
  });

  it("leaves unknown messages untranslated", () => {
    expect(billingErrorKey("Something else")).toBeNull();
  });
});
