import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRequiredRoutePermission } from "@/lib/routeScope";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("one calendar page contract", () => {
  const app = read("client/src/App.tsx");
  const page = read("client/src/pages/OneCalendar.tsx");
  const hook = read("client/src/pages/useOneCalendar.ts");
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

  it("uses one monthly calendar with range selection and a per-type save panel", () => {
    expect(page).not.toContain("OneCalendarTimeline");
    expect(page).not.toContain('setMode("timeline")');
    expect(page).toContain("selectCalendarDate(range[0], range[1], date)");
    expect(page).toContain("<OneCalendarSidePanel");
    expect(panel).toContain("one-calendar-panel panel");
    expect(page).toContain("range[0], selection.lastNight");
    expect(page).toContain("nightCount={selection.nightCount}");
    expect(panel).toContain('t("oneCalendar.editOneNight"');
    expect(panel).toContain('t("oneCalendar.editNights"');
    expect(page).toContain("data.save.mutateAsync(input)");
  });

  it("keeps month cells responsive and leaves range selection controls intact", () => {
    expect(css).toContain("@media (max-width: 600px)");
    expect(css).toContain(".one-calendar-day,.one-calendar-blank { min-height: 5rem;");
    expect(page).toContain("onClick={() => chooseDay(date)}");
    expect(page).toContain('className="one-calendar-day-room-count"');
    expect(page).toContain('className="one-calendar-day-price"');
  });

  it("derives editable actions from permissions for the selected hotel", () => {
    expect(hook).toContain("hasHotelPermission(roles, memberships, hotelId, permission)");
    expect(hook).toContain('canManageAllotment: can("revenue.manage_allotment")');
    expect(hook).toContain('canManageStopSell: can("revenue.manage_stop_sell")');
  });

  it("shows room controls per selected type, hides rate fields without rate access, and surfaces localized save errors", () => {
    expect(panel).toContain("roomTypes.map(roomType =>");
    expect(panel).toContain("edits[roomType.id]");
    expect(panel).toContain("props.onEditChange(roomType.id");
    expect(panel).toContain("{canManageRates &&");
    expect(panel).toContain("{canManageAllotment &&");
    expect(panel).toContain('role="alert"');
    expect(page).toContain('setError(t("oneCalendar.saveError"))');
  });

  it("keeps prices in month cells only and gates rate controls by permission", () => {
    expect(page).not.toContain("OneCalendarTimeline");
    expect(css).toContain(".one-calendar-page { min-width: 0;");
    expect(page).toContain("data.calendar.data?.canSeePrice &&");
    expect(panel).toContain("{canManageRates && <div className=\"one-calendar-control-grid\">");
    expect(hook).toContain('canManageRates: can("revenue.manage_rates")');
  });
});
