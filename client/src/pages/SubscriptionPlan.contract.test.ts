import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
describe("owner subscription pages", () => {
  it("registers the hotel billing route and owner billing permission", () => {
    expect(read("client/src/App.tsx")).toContain('path="/hotels/:id/billing"');
    expect(read("client/src/lib/routeScope.ts")).toContain('"property.manage_billing"');
    expect(read("client/src/components/layout/AppShell.tsx")).toContain('memberships.some');
    expect(read("shared/authorization.ts")).toContain('"property.manage_billing"');
  });
  it("renders the plan choice, quote, PromptPay QR, slip upload and not-ready copy", () => {
    const page = read("client/src/pages/SubscriptionPlan.tsx");
    const logic = read("client/src/pages/useSubscriptionPlan.ts");
    expect(logic).toContain("subscriptionBilling.quote");
    expect(logic).toContain("subscriptionBilling.createPayment");
    expect(logic).toContain("subscriptionBilling.verifySlip");
    expect(page).toContain("PromptPayQr");
    // The hotel's billing card is grouped with its payment and invoice settings.
    expect(read("client/src/pages/HotelFinanceSettings.tsx")).toContain("home-plan-card");
  });
});
