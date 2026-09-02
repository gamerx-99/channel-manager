import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Channel Performance dashboard contract", () => {
  const routerText = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const dashboardRouterText = readFileSync(resolve(process.cwd(), "server/routers/dashboardRouter.ts"), "utf8");
  const router = routerText + dashboardRouterText;
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/ChannelPerformance.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const appShell = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");

  it("exposes a protected property-scoped channel performance procedure", () => {
    expect(router).toContain("export const channelPerformance = protectedProcedure.query");
    expect(router).toContain("listManagedHotels(client)");
    expect(router).toContain("getGlobalOtaSummary(ctx.user.accessToken)");
    expect(router).toContain("buildChannelPerformanceSummary(hotels, otaSummary)");
  });

  it("registers the page and gates it with the reporting permission", () => {
    expect(app).toContain('path="/dashboard/channels"');
    expect(appShell).toContain('can("property.view_reports")');
    expect(routeScope).toContain('pathname.startsWith("/dashboard/channels")');
    expect(routeScope).toContain('return "property.view_reports"');
  });

  it("includes loading, retry, search, filter, chart, and empty-state contracts", () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in ChannelPerformance.tsx
    expect(component).toContain("channelPerformance.loadingData");
    expect(component).toContain('role="status"');
    expect(component).toContain('placeholder={t("channelPerformance.searchChannelsPlaceholder")}');
    expect(component).toContain('aria-pressed={filter === option.value}');
    expect(component).toContain("<AreaChart data={data.trend}");
    expect(component).toContain("<BarChart data={bookingChannels}");
    expect(component).toContain("<Pie data={bookingPieData}");
    expect(component).toContain("channelPerformance.noChannelsMatch");
    expect(component).toContain('actionLabel={t("channelPerformance.tryAgain")}');
  });

  it("does not infer OTA booking revenue before a real booking API is enabled", () => {
    // Note: Updated per Rule 6 to match translation dictionary key
    expect(component).toContain("channelPerformance.otaBookingNote");
  });
});
