import { useState } from "react";
import { trpc } from "@/lib/trpc";

/** Maps a billing server message to an i18n key under `subscription.`; null shows the raw message. */
export function billingErrorKey(message: string): string | null {
  const known: Record<string, string> = {
    "Coupon code is invalid.": "couponInvalid",
    coupon_inactive: "couponInactive",
    coupon_expired: "couponExpired",
    coupon_used_up: "couponUsedUp",
    coupon_already_redeemed: "couponAlreadyRedeemed",
    "Slip could not be verified.": "slipNotVerified",
    "Slip amount does not match the payment.": "slipAmountMismatch",
    "Payment QR has expired.": "qrExpired",
    "Payment is no longer pending.": "paymentNotPending",
  };
  if (message.includes("not ready")) return "notReady";
  return known[message.trim()] ?? null;
}

export function useSubscriptionPlan(hotelId: string) {
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [couponCode, setCouponCode] = useState("");
  const [payment, setPayment] = useState<{ paymentId: string; qr: string | null; status: "pending" | "verified"; qrExpiresAt: Date | null } | null>(null);
  const quote = trpc.subscriptionBilling.quote.useQuery({ hotelId, months, ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}) }, { enabled: Boolean(hotelId), retry: false });
  const create = trpc.subscriptionBilling.createPayment.useMutation();
  const verify = trpc.subscriptionBilling.verifySlip.useMutation();
  const utils = trpc.useUtils();
  const selectMonths = (value: string) => setMonths(Number(value) as 1 | 3 | 6 | 12);
  const applyCoupon = (value: string) => setCouponCode(value);
  const makePayment = async () => {
    const result = await create.mutateAsync({ hotelId, months, ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}) });
    setPayment(result);
    if (result.status === "verified") await utils.subscriptionBilling.state.invalidate();
  };
  const uploadSlip = async (file: File) => {
    const slipData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read slip image."));
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    const result = await verify.mutateAsync({ hotelId, paymentId: payment!.paymentId, slipData });
    setPayment(current => current ? { ...current, status: result.status } : null);
    await utils.subscriptionBilling.state.invalidate();
  };
  return { months, selectMonths, couponCode, applyCoupon, quote, payment, createPending: create.isPending, verifyPending: verify.isPending,
    error: create.error?.message ?? verify.error?.message ?? quote.error?.message ?? null, makePayment, uploadSlip };
}
