import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Channel Performance dashboard contract", () => {
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/ChannelPerformance.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");

  it("exposes a protected property-scoped channel performance procedure", () => {
    expect(router).toContain("channelPerformance: protectedProcedure");
    expect(router).toContain("listManagedHotels(client)");
    expect(router).toContain("getGlobalOtaSummary(ctx.user.accessToken)");
    expect(router).toContain("buildChannelPerformanceSummary(hotels, otaSummary)");
  });

  it("registers the page and gates it with the reporting permission", () => {
    expect(app).toContain('path="/dashboard/channels"');
    expect(app).toContain('can("property.view_reports")');
    expect(routeScope).toContain('pathname.startsWith("/dashboard/channels")');
    expect(routeScope).toContain('return "property.view_reports"');
  });

  it("includes loading, retry, search, filter, chart, and empty-state contracts", () => {
    expect(component).toContain("Loading channel performance data");
    expect(component).toContain('role="status"');
    expect(component).toContain('placeholder="Search channels…"');
    expect(component).toContain('aria-pressed={filter === option.value}');
    expect(component).toContain("<AreaChart data={data.trend}");
    expect(component).toContain("<BarChart data={bookingChannels}");
    expect(component).toContain("<Pie data={bookingPieData}");
    expect(component).toContain("No channels match");
    expect(component).toContain('actionLabel="Try again"');
  });

  it("does not infer OTA booking revenue before a real booking API is enabled", () => {
    expect(component).toContain("OTA booking revenue is not inferred until a live booking API integration is enabled.");
  });
});
