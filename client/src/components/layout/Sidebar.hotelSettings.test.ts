import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type Permission } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { getHotelSettingsItems } from "./Sidebar";

const t = (key: string) => key;
const canFor = (permissions: readonly Permission[]) => (permission: Permission) => permissions.includes(permission);

describe("sidebar hotel settings group", () => {
  it("gives the owner profile, staff and hayhost support access links", () => {
    const items = getHotelSettingsItems("h1", canFor(resolveMembershipPermissions("hotel_owner")), t);
    expect(items.map(item => item.href)).toEqual(["/hotels/h1/profile", "/hotels/h1/staff", "/hotels/h1/support-access"]);
    expect(items.map(item => item.label)).toEqual(["sidebar.hotelProfile", "sidebar.hotelStaff", "supportAccess.navLabel"]);
  });

  it("is empty for staff roles without those permissions, so the button never shows", () => {
    for (const role of ["front_desk", "housekeeping", "revenue_manager"] as const) {
      expect(getHotelSettingsItems("h1", canFor(resolveMembershipPermissions(role)), t)).toEqual([]);
    }
  });

  it("is empty when no hotel is selected", () => {
    expect(getHotelSettingsItems(null, () => true, t)).toEqual([]);
  });

  it("renders the group only when it has links, and no longer lists them in the main hotel list", () => {
    const source = readFileSync(resolve(__dirname, "Sidebar.tsx"), "utf8");
    expect(source).toContain("settingsItems.length > 0 &&");
    expect(source).toContain('t("sidebar.hotelSettings")');
    const hotelNav = source.slice(source.indexOf("const hotelNavItems"), source.indexOf("const settingsItems"));
    expect(hotelNav).not.toContain("/support-access");
    expect(hotelNav).not.toContain("/staff");
  });
});
