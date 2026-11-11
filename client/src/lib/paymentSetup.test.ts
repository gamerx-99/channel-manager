import { describe, expect, it } from "vitest";
import { financeSettingsPath, missingPaymentSetup, shouldShowPaymentReminder } from "./paymentSetup";

const HOTEL = "11111111-1111-4111-8111-111111111111";

describe("missingPaymentSetup", () => {
  it("lists what is not saved yet", () => {
    expect(missingPaymentSetup({ promptpay_configured: false, slipok_configured: false })).toEqual(["promptpay", "slipok"]);
    expect(missingPaymentSetup({ promptpay_configured: true, slipok_configured: false })).toEqual(["slipok"]);
    expect(missingPaymentSetup({ promptpay_configured: false, slipok_configured: true })).toEqual(["promptpay"]);
    expect(missingPaymentSetup({ promptpay_configured: true, slipok_configured: true })).toEqual([]);
  });

  it("lists nothing while the status is unknown", () => {
    expect(missingPaymentSetup(undefined)).toEqual([]);
    expect(missingPaymentSetup(null)).toEqual([]);
  });
});

describe("shouldShowPaymentReminder", () => {
  const base = { enabled: true, hotelId: HOTEL, missing: ["slipok"] as const, location: "/dashboard", dismissedAt: null };

  it("shows when something is missing", () => {
    expect(shouldShowPaymentReminder(base)).toBe(true);
  });

  it("stays hidden once the page it was closed on is still open, and comes back on the next page", () => {
    expect(shouldShowPaymentReminder({ ...base, dismissedAt: "/dashboard" })).toBe(false);
    expect(shouldShowPaymentReminder({ ...base, dismissedAt: "/dashboard", location: "/hotels/x/bookings" })).toBe(true);
  });

  it("stays away from the finance settings page", () => {
    expect(shouldShowPaymentReminder({ ...base, location: financeSettingsPath(HOTEL) })).toBe(false);
  });

  it("is off when disabled, without a hotel, or when nothing is missing", () => {
    expect(shouldShowPaymentReminder({ ...base, enabled: false })).toBe(false);
    expect(shouldShowPaymentReminder({ ...base, hotelId: null })).toBe(false);
    expect(shouldShowPaymentReminder({ ...base, missing: [] })).toBe(false);
  });
});
