import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");

describe("Sidebar booking engine button", () => {
  it("renders only the workspace switcher above the workspace heading", () => {
    expect(sidebar).not.toContain("activeHotel={selectedHotel}");
    expect(sidebar).not.toContain("viewPropertySite");
  });

  it("keeps the booking engine destination in Website Builder instead of the sidebar", () => {
    expect(sidebar).not.toContain('t("sidebar.bookingEngines")');
    expect(sidebar).not.toContain("#book");
  });

  it("shows the support-mode note only to hayhost staff, never to a hotel owner (regression: every account saw it)", () => {
    const at = sidebar.indexOf('className="support-note"');
    expect(at).toBeGreaterThan(0);
    expect(sidebar.slice(Math.max(0, at - 80), at)).toContain("isPlatformAdmin && (");
  });

  it("has no Channel analytics link", () => {
    expect(sidebar).not.toContain("/dashboard/channels");
  });
  it("places both report links in the system section", () => {
    const systemStart = sidebar.indexOf('t("sidebar.system")');
    expect(sidebar.indexOf('href="/reports/bookings"')).toBeGreaterThan(systemStart);
    expect(sidebar.indexOf('href="/dashboard/financials"')).toBeGreaterThan(systemStart);
    expect(sidebar.indexOf('href="/dashboard/financials"')).toBeGreaterThan(sidebar.indexOf('href="/reports/bookings"'));
  });
  it("shows each section heading only when its links are visible", () => {
    expect(sidebar).toContain('communicationsEnabled && can("operations.view_bookings") && <p className="nav-label nav-label-spaced">{t("sidebar.operationsModules")}</p>');
    expect(sidebar).toContain('{can("staff.view_shifts") && (');
    expect(sidebar).toContain('{(settingsItems.length > 0 || can("platform.manage_users") || can("reports.view_bookings") || can("property.view_financials")) && <p className="nav-label nav-label-spaced">{t("sidebar.system")}</p>}');
  });
});
