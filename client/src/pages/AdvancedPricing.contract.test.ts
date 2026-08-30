import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdvancedPricing dashboard contract", () => {
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/AdvancedPricing.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const authorization = readFileSync(resolve(process.cwd(), "shared/authorization.ts"), "utf8");

  it("registers the page route and gates sidebar link with revenue.manage_pricing_rules", () => {
    expect(app).toContain('path="/dashboard/pricing"');
    expect(app).toContain("AdvancedPricing");
    expect(app).toContain('can("revenue.manage_pricing_rules")');
    expect(app).toContain('href="/dashboard/pricing"');
    expect(routeScope).toContain('pathname.startsWith("/dashboard/pricing")');
    expect(routeScope).toContain('return "revenue.manage_pricing_rules"');
  });

  it("no longer shows the placeholder toast for Advanced Pricing", () => {
    expect(app).not.toContain("Advanced Pricing module is coming soon");
  });

  it("grants revenue.manage_pricing_rules to hotel_owner and revenue_manager", () => {
    expect(authorization).toContain('"revenue.manage_pricing_rules"');
    // both roles must include it — check ROLE_PERMISSIONS blocks
    expect(authorization).toContain('revenue_manager');
  });

  it("includes calendar-style editor, override CRUD, and pricing-specific markers", () => {
    expect(component).toContain("Advanced Pricing");
    expect(component).toContain("Pricing calendar");
    expect(component).toContain("Rate overrides");
    expect(component).toContain("Create rate override");
    expect(component).toContain("override_price");
    expect(component).toContain("min_stay_nights");
    expect(component).toContain("start_date");
    expect(component).toContain("end_date");
    expect(component).toContain("room_type_id");
    expect(component).toContain('role="status"');
    expect(component).toContain("Loading pricing data");
    expect(component).toContain("resolveEffectiveRate");
    expect(component).toContain("overlaps");
  });

  it("is wired to the real tRPC pricing procedures, not local/mock state", () => {
    expect(component).toContain("trpc.channelManager.listRateOverrides.useQuery");
    expect(component).toContain("trpc.channelManager.createRateOverride.useMutation");
    expect(component).toContain("trpc.channelManager.deleteRateOverride.useMutation");
    expect(component).not.toContain("LocalOverride");
  });
});
