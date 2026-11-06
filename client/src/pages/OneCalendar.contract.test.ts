import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRequiredRoutePermission } from "@/lib/routeScope";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("one calendar page contract", () => {
  const app = read("client/src/App.tsx");
  const page = read("client/src/pages/OneCalendar.tsx");
  const hook = read("client/src/pages/useOneCalendar.ts");

  it("registers the hotel calendar under the hotel-view permission", () => {
    expect(app).toContain("<OneCalendar id={params.id} />");
    expect(getRequiredRoutePermission("/hotels/hotel-1/calendar")).toBe("property.view");
    expect(getRequiredRoutePermission("/dashboard/pricing")).toBe("revenue.manage_pricing_rules");
  });

  it("offers month and timeline modes with range selection and a shared save panel", () => {
    expect(page).toContain('setMode("month")');
    expect(page).toContain('setMode("timeline")');
    expect(page).toContain("selectCalendarDate(range[0], range[1], date)");
    expect(page).toContain("one-calendar-panel panel");
    expect(page).toContain("data.save.mutateAsync(input as any)");
  });

  it("keeps prices in month cells only and gates price controls by permission", () => {
    const timeline = page.slice(page.indexOf("<div className=\"one-calendar-timeline-scroll\">"), page.indexOf("<p className=\"field-help\">"));
    expect(timeline).not.toContain("row?.price");
    expect(page).toContain("data.calendar.data?.canSeePrice &&");
    expect(page).toContain("data.canManageRates && <div className=\"one-calendar-control-grid\">");
    expect(hook).toContain('permissions.includes("revenue.manage_rates")');
  });
});
