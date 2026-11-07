import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
describe("guided tour contract", () => {
  it("registers the signed-in guide, real targets, and skip control", () => {
    expect(read("../../App.tsx")).toContain('path="/help/getting-started"');
    const sidebar = read("../../components/layout/Sidebar.tsx");
    expect(sidebar).toContain('tourTarget: "hotel-settings"');
    const guidedTour = read("../../components/tour/GuidedTour.tsx");
    expect(guidedTour).toContain('[aria-controls="sidebar-hotel-settings"]');
    expect(guidedTour).toContain('[data-tour="hotel-settings"]');
    expect(guidedTour).toContain('[data-tour="hotel-settings-fields"]');
    expect(guidedTour).toContain('onRoomStep(); next();');
    expect(guidedTour).not.toContain('guided-tour:close-hotel-editor');
    expect(read("../../components/layout/AppShell.tsx")).toContain('location === `/hotels/${selectedHotelId}/profile`');
    expect(read("../../components/layout/AppShell.tsx")).toContain("window.sessionStorage.setItem(TOUR_STEP_KEY, 'rooms')");
    expect(read("../../components/tour/useGuidedTour.ts")).toContain("window.sessionStorage.getItem(TOUR_STEP_KEY) === 'rooms' ? 1 : 0");
    expect(read("../../pages/HotelProfile.tsx")).toContain('data-tour="hotel-settings-fields"');
    const hotel = read("../../pages/HotelDetail.tsx");
    expect(hotel).toContain('data-tour="room-settings"');
    expect(read("../../components/tour/GuidedTour.tsx")).toContain('t("guidedTour.skip")');
  });
});
