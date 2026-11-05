import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type Permission } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { getRoomsAndPricingItems } from "./Sidebar";

const t = (key: string) => key;
const canFor = (permissions: readonly Permission[]) => (permission: Permission) => permissions.includes(permission);

describe("sidebar rooms and rates group", () => {
  it("gives the owner three links, each to a different page", () => {
    const items = getRoomsAndPricingItems("h1", canFor(resolveMembershipPermissions("hotel_owner")), t);
    expect(items.map(item => item.href)).toEqual(["/hotels/h1", "/dashboard/pricing", "/hotels/h1/calendar"]);
    expect(new Set(items.map(item => item.href)).size).toBe(items.length);
    expect(items.map(item => item.label)).toEqual(["sidebar.roomTypesManage", "sidebar.roomPricingManage", "sidebar.availability"]);
  });

  it("shows only the links the role may use", () => {
    expect(getRoomsAndPricingItems("h1", canFor(["property.view"]), t).map(item => item.href)).toEqual(["/hotels/h1/calendar"]);
    expect(getRoomsAndPricingItems("h1", canFor(["revenue.manage_pricing_rules"]), t).map(item => item.href)).toEqual(["/dashboard/pricing"]);
    expect(getRoomsAndPricingItems("h1", canFor([]), t)).toEqual([]);
  });

  it("keeps the hotel-bound links out when no hotel is selected", () => {
    const items = getRoomsAndPricingItems(null, () => true, t);
    expect(items.map(item => item.href)).toEqual(["/dashboard/pricing"]);
  });

  it("renders the group only when it has links, as a button that opens no page, and no longer lists these pages elsewhere", () => {
    const source = readFileSync(resolve(__dirname, "Sidebar.tsx"), "utf8");
    expect(source).toContain("roomsItems.length > 0 &&");
    expect(source).toContain('t("sidebar.roomsAndPricing")');
    expect(source).not.toContain('t("sidebar.advancedPricing")');
    const hotelNav = source.slice(source.indexOf("const hotelNavItems"), source.indexOf("const settingsItems"));
    expect(hotelNav).not.toContain("/calendar");
    expect(hotelNav).not.toContain("roomOperations");
  });
});
