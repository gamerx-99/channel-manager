import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertSlipPaymentMatch, transitionSubscriptionPayment } from "./subscriptionPayments";

describe("subscription payment state machine", () => {
  it.each([["verify_success", "verified"], ["verify_failure", "failed"], ["expire", "expired"]] as const)("pending -> %s", (event, status) => {
    expect(transitionSubscriptionPayment("pending", event)).toBe(status);
  });
  it.each(["verified", "failed", "expired"] as const)("refuses transitions from terminal %s", status => {
    expect(() => transitionSubscriptionPayment(status, "verify_success")).toThrow(TRPCError);
  });
  it("accepts only an exact amount and a transaction reference", () => {
    expect(assertSlipPaymentMatch({ matched: true, amount: 299, expectedAmount: 299, transactionRef: "ref-1" })).toBe("ref-1");
    expect(() => assertSlipPaymentMatch({ matched: true, amount: 298, expectedAmount: 299, transactionRef: "ref-2" })).toThrow("Slip amount does not match");
    expect(() => assertSlipPaymentMatch({ matched: false, amount: 299, expectedAmount: 299, transactionRef: "ref-3" })).toThrow("Slip could not be verified");
  });
});
