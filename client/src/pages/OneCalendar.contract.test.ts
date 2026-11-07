import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRequiredRoutePermission } from "@/lib/routeScope";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("one calendar page contract", () => {
  const app = read("client/src/App.tsx");
  const page = read("client/src/pages/OneCalendar.tsx");
  const hook = read("client/src/pages/useOneCalendar.ts");
  const timeline = read("client/src/pages/OneCalendarTimeline.tsx");
  const panel = read("client/src/pages/OneCalendarSidePanel.tsx");
  const css = read("client/src/pages/oneCalendar.css");

  it("registers the hotel calendar and redirects the legacy pricing route", () => {
    expect(app).toContain("<OneCalendar id={params.id} />");
    expect(app).toContain("function PricingRedirect()");
    expect(app).toContain("/hotels/${selectedHotelId}/calendar");
    expect(app).toContain("<PrivateRoute><PricingRedirect /></PrivateRoute>");
    expect(getRequiredRoutePermission("/hotels/hotel-1/calendar")).toBe("property.view");
    expect(getRequiredRoutePermission("/dashboard/pricing")).toBeNull();
  });

  it("offers month and timeline modes with range selection and a shared save panel", () => {
    expect(page).toContain('setMode("month")');
    expect(page).toContain('setMode("timeline")');
    expect(page).toContain("selectCalendarDate(range[0], range[1], date)");
    expect(page).toContain("<OneCalendarSidePanel");
    expect(panel).toContain("one-calendar-panel panel");
    expect(page).toContain("end_date: selection.lastNight");
    expect(page).toContain("nightCount={selection.nightCount}");
    expect(panel).toContain('t("oneCalendar.editOneNight"');
    expect(panel).toContain('t("oneCalendar.editNights"');
    expect(page).toContain("data.save.mutateAsync(input as any)");
  });

  it("shows room controls per selected type, hides rate fields without rate access, and surfaces localized save errors", () => {
    expect(panel).toContain("roomTypes.map(roomType =>");
    expect(panel).toContain("{canManageRates &&");
    expect(panel).toContain("{canManageAllotment &&");
    expect(panel).toContain('role="alert"');
    expect(page).toContain('setError(t("oneCalendar.saveError"))');
  });

  it("keeps prices in month cells only and gates price controls by permission", () => {
    expect(timeline).not.toContain("price");
    expect(timeline).toContain("one-calendar-timeline-scroll");
    expect(css).toContain(".one-calendar-timeline-scroll { width: 100%; max-width: 100%; overflow-x: auto;");
    expect(css).toContain(".one-calendar-page { min-width: 0;");
    expect(css).toContain(".one-calendar-timeline { border-collapse: separate; border-spacing: 0; min-width: max-content;");
    expect(page).toContain("data.calendar.data?.canSeePrice &&");
    expect(panel).toContain("{canManageRates && <div className=\"one-calendar-control-grid\">");
    expect(hook).toContain('permissions.includes("revenue.manage_rates")');
  });
});
