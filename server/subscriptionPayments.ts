import { TRPCError } from "@trpc/server";

export type SubscriptionPaymentStatus = "pending" | "verified" | "failed" | "expired";
export type PaymentEvent = "verify_success" | "verify_failure" | "expire";

/** Full subscription payment state machine. Terminal states cannot be changed again. */
export function transitionSubscriptionPayment(status: SubscriptionPaymentStatus, event: PaymentEvent): SubscriptionPaymentStatus {
  if (status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "Payment is no longer pending." });
  if (event === "verify_success") return "verified";
  if (event === "verify_failure") return "failed";
  return "expired";
}

export function assertSlipPaymentMatch(input: { matched: boolean; amount: number | null; expectedAmount: number; transactionRef: string | null }) {
  if (!input.matched || input.transactionRef === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Slip could not be verified." });
  if (input.amount === null || Math.round(input.amount * 100) !== Math.round(input.expectedAmount * 100)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Slip amount does not match the payment." });
  }
  return input.transactionRef;
}
