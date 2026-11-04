import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("platform billing pages", () => {
  it("registers CRM and coupons routes with permission scopes and required fields", () => {
    const app = read("client/src/App.tsx");
    const scope = read("client/src/lib/routeScope.ts");
    expect(app).toContain('path="/platform/crm"');
    expect(app).toContain('path="/platform/coupons"');
    expect(scope).toContain('pathname.startsWith("/platform/crm")');
    expect(scope).toContain('return "platform.manage_billing"');
    expect(read("client/src/pages/PlatformOverview.tsx")).toContain("billingSummary");
    expect(read("client/src/pages/PlatformCrm.tsx")).toContain("accountCreatedAt");
    expect(read("client/src/pages/PlatformCrm.tsx")).toContain("setHotelPlan");
    expect(read("client/src/pages/PlatformCoupons.tsx")).toContain("redemptionCount");
  });
});
