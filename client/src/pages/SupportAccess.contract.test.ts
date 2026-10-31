import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
const app = read("client/src/App.tsx");
const scope = read("client/src/lib/routeScope.ts");
describe("support and staff page contracts", () => {
  it("HotelStaff keeps its registered permission gate and renders per-person toggles", () => {
    expect(app).toContain('path="/hotels/:id/staff"');
    expect(scope).toContain('return "property.manage_staff"');
    expect(read("client/src/pages/HotelStaff.tsx")).toContain("<StaffPermissionToggles");
    const toggles = read("client/src/components/StaffPermissionToggles.tsx");
    for (const marker of ["PERMISSION_TOGGLES.map", "applyToggle", "checkPermissionEdit", "updateStaffPermissions", 'type="checkbox"', 'role="alert"']) expect(toggles).toContain(marker);
  });
  it("owner approval screen offers exact duration/mode selection, revoke and access history", () => {
    expect(app).toContain('path="/hotels/:id/support-access"');
    expect(scope).toContain('return "property.manage_support_access"');
    const page = read("client/src/pages/SupportAccess.tsx");
    for (const marker of ["hasHotelPermission", "SUPPORT_GRANT_DURATION_HOURS.map", "grantSupport.useMutation", "revokeSupport.useMutation", 't("supportAccess.historyTitle")', "entry.supportUserId", "entry.action", 'role="alert"', 'role="status"']) expect(page).toContain(marker);
  });
  it("platform dashboard uses the summary-only endpoint and permission gate", () => {
    expect(app).toContain('path="/platform"');
    expect(scope).toContain('return "platform.view_system_logs"');
    const page = read("client/src/pages/PlatformOverview.tsx");
    for (const marker of ["platformSummary.useQuery", "hotel.hotelName", "hotel.plan", "hotel.paymentStatus", "hotel.roomCount", "hotel.syncStatus", 'role="alert"']) expect(page).toContain(marker);
    expect(page).not.toContain("hotel.id");
  });
  it("the shell uses selected-hotel permissions and displays support mode/expiry", () => {
    const shell = read("client/src/components/layout/AppShell.tsx");
    expect(shell).toContain("m.hotelId === selectedHotelId");
    expect(shell).toContain("m.permissions?.includes(permission)");
    expect(shell).toContain("<SupportAccessBanner");
    const banner = read("client/src/components/SupportAccessBanner.tsx");
    // The English labels moved to the i18n dictionaries when the page was translated to Thai.
    for (const marker of ["selectedHotelId", "membership.mode", "membership.expiresAt", 't("supportAccess.modeView")', 'role="status"']) expect(banner).toContain(marker);
  });
});
