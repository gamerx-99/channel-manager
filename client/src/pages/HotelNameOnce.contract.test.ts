import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("single hotel name surface", () => {
  it.each([
    "client/src/pages/HotelDetail.tsx",
    "client/src/pages/HotelServices.tsx",
    "client/src/pages/Bookings.tsx",
  ])("removes the duplicate hotel header from %s", path => {
    const source = read(path);
    expect(source).not.toContain("property-hero");
    expect(source).not.toContain("detail-back");
  });

  it("keeps the workspace switcher free of hotel status and website metadata", () => {
    const workspace = read("client/src/components/WorkspaceMenu.tsx");
    expect(workspace).not.toContain("workspace-hotel-meta");
    expect(workspace).not.toContain("activeHotel.public_enabled");
    expect(workspace).not.toContain("activeHotel?:");
    expect(workspace).not.toContain("target=\"_blank\"");
    expect(workspace).not.toContain("viewPropertySite");
    const sidebar = read("client/src/components/layout/Sidebar.tsx");
    expect(sidebar).not.toContain("activeHotel={selectedHotel}");
  });

  it("gates the hotel profile link by property.manage_profile", () => {
    const sidebar = read("client/src/components/layout/Sidebar.tsx");
    expect(sidebar).toContain('can("property.manage_profile")');
    expect(sidebar).toContain('label: t("sidebar.hotelProfile")');
    expect(sidebar).toContain("?edit=profile");
  });

  it("uses the shared hotel selection on housekeeping and communications", () => {
    for (const path of ["client/src/pages/Housekeeping.tsx", "client/src/pages/Communications.tsx"]) {
      const source = read(path);
      expect(source).toContain("useHotel()");
      expect(source).not.toContain("hotelSelectorAria");
    }
  });
});
