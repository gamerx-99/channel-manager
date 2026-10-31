import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Financials dashboard contract", () => {
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const dashboardRouterText = readFileSync(resolve(process.cwd(), 'server/routers/dashboardRouter.ts'), 'utf8');
  const router = routerText + dashboardRouterText;
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/Financials.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const appShell = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const authorization = readFileSync(resolve(process.cwd(), "shared/authorization.ts"), "utf8");

  it("exposes a protected financials procedure gated by requireFinancialsAccess, not requireHotelPermission", () => {
    expect(router).toContain("export const financials = protectedProcedure.query");
    expect(router).toContain("requireFinancialsAccess(ctx.user)");
    expect(router).toContain("d1ListManagedHotelsForFinancials(ctx.db");
    expect(router).toContain("buildFinancialsSummary(hotels as any)");
  });

  it("registers the page and gates it with the financials-only permission", () => {
    expect(app).toContain('path="/dashboard/financials"');
    expect(appShell).toContain('can("property.view_financials")');
    expect(routeScope).toContain('pathname.startsWith("/dashboard/financials")');
    expect(routeScope).toContain('return "property.view_financials"');
  });

  it("grants property.view_financials to hotel_owner only, excluding super_admin's blanket grant", () => {
    expect(authorization).toContain('"property.view_financials"');
    expect(authorization).toContain('permission !== "property.view_financials"');
  });

  it("includes loading, retry, revenue trend, room-type breakdown, and CSV export contracts", () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in Financials.tsx
    expect(component).toContain('financials.loadingData');
    expect(component).toContain('role="status"');
    expect(component).toContain("<AreaChart data={data.trend}");
    expect(component).toContain("<BarChart data={data.roomTypeBreakdown}");
    expect(component).toContain("downloadRoomTypeCsv");
    expect(component).toContain('actionLabel={t("financials.tryAgain")}');
  });

  it("includes collected, outstanding, and pending payment collection breakdown", () => {
    expect(component).toContain('t("financials.paymentCollectionAria")');
    expect(component).toContain('t("financials.collectedRevenue")');
    expect(component).toContain('t("financials.outstandingRevenue")');
    expect(component).toContain('t("financials.pendingRevenue")');
  });

  it("asks for an authenticator step-up before saving PromptPay and guides owners without one", () => {
    expect(component).toContain("useMfaStepUp()");
    expect(component).toContain('(await triggerStepUp()) === "verified"');
    expect(component).toContain('id="promptpay-totp-input"');
    expect(component).toContain('mfaState.status === "needs_enroll"');
    expect(component).toContain('href="/mfa/enroll?next=/dashboard/financials"');
  });
});
