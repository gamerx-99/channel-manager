import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Financials dashboard contract", () => {
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/Financials.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const authorization = readFileSync(resolve(process.cwd(), "shared/authorization.ts"), "utf8");

  it("exposes a protected financials procedure gated by requirePermission, not requireHotelPermission", () => {
    expect(router).toContain("financials: protectedProcedure.query");
    expect(router).toContain("requirePermission(ctx.user, 'property.view_financials')");
    expect(router).toContain("listManagedHotelsForFinancials(rlsClient(ctx.user.accessToken))");
    expect(router).toContain("buildFinancialsSummary(hotels)");
  });

  it("registers the page and gates it with the financials-only permission", () => {
    expect(app).toContain('path="/dashboard/financials"');
    expect(app).toContain('can("property.view_financials")');
    expect(routeScope).toContain('pathname.startsWith("/dashboard/financials")');
    expect(routeScope).toContain('return "property.view_financials"');
  });

  it("grants property.view_financials to hotel_owner only, excluding super_admin's blanket grant", () => {
    expect(authorization).toContain('"property.view_financials"');
    expect(authorization).toContain('permission !== "property.view_financials"');
  });

  it("includes loading, retry, revenue trend, room-type breakdown, and CSV export contracts", () => {
    expect(component).toContain("Loading financials data");
    expect(component).toContain('role="status"');
    expect(component).toContain("<AreaChart data={data.trend}");
    expect(component).toContain("<BarChart data={data.roomTypeBreakdown}");
    expect(component).toContain("downloadRoomTypeCsv");
    expect(component).toContain('actionLabel="Try again"');
  });
});
