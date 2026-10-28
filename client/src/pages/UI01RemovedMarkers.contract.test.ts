import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("UI-01 removed markers are gone", () => {
  const hotelDetail = readFileSync(resolve(process.cwd(), "client/src/pages/HotelDetail.tsx"), "utf8");
  const hotelServices = readFileSync(resolve(process.cwd(), "client/src/pages/HotelServices.tsx"), "utf8");
  const calendar = readFileSync(resolve(process.cwd(), "client/src/pages/Calendar.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const topbar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Topbar.tsx"), "utf8");
  const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");

  it("HotelDetail no longer contains removed markers", () => {
    for (const marker of ["quick-panel", "checklist-panel", "tabImages", "tabDomains", "editPropertyTooltip"]) {
      expect(hotelDetail).not.toContain(marker);
    }
  });

  it("HotelServices no longer contains removed markers", () => {
    for (const marker of ["tabImages", "tabDomains", "editPropertyTooltip"]) {
      expect(hotelServices).not.toContain(marker);
    }
  });

  it("Calendar no longer contains removed markers", () => {
    expect(calendar).not.toContain("viewSettingsTooltip");
  });

  it("Home no longer contains removed markers", () => {
    for (const marker of ["moreQuickActionsToast", "connectedToSupabase"]) {
      expect(home).not.toContain(marker);
    }
  });

  it("Topbar no longer contains removed markers", () => {
    expect(topbar).not.toContain("topbar-search");
  });

  it("Sidebar no longer contains removed markers", () => {
    for (const marker of ["paymentsComingSoon", "exportsPrompt"]) {
      expect(sidebar).not.toContain(marker);
    }
  });
});