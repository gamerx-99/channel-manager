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
    expect(guidedTour).toContain('if (step.target === "hotel-settings") onRoomStep();');
    expect(guidedTour).not.toContain('guided-tour:close-hotel-editor');
    expect(read("../../components/layout/AppShell.tsx")).toContain('location === `/hotels/${selectedHotelId}/profile`');
    expect(read("../../components/layout/AppShell.tsx")).toContain("window.sessionStorage.setItem(TOUR_STEP_KEY, 'rooms')");
    expect(read("../../components/tour/useGuidedTour.ts")).toContain("const RESUME_STEP: Record<string, number> = { rooms: 1, finance: 2 };");
    expect(read("../../pages/HotelProfile.tsx")).toContain('data-tour="hotel-settings-fields"');
    const hotel = read("../../pages/HotelDetail.tsx");
    expect(hotel).toContain('data-tour="room-settings"');
    expect(read("../../components/tour/GuidedTour.tsx")).toContain('t("guidedTour.skip")');
  });

  it("walks the new owner on to the finance settings page", () => {
    const guidedTour = read("../../components/tour/GuidedTour.tsx");
    expect(guidedTour).toContain('if (step.target === "room-settings") onFinanceStep(); next();');
    const shell = read("../../components/layout/AppShell.tsx");
    expect(shell).toContain('target: "finance-settings"');
    expect(shell).toContain("window.sessionStorage.setItem(TOUR_STEP_KEY, 'finance')");
    expect(shell).toContain("navigate(`/hotels/${selectedHotelId}/settings/finance`)");
    expect(shell).toContain('location === `/hotels/${selectedHotelId}/settings/finance`');
    expect(shell).toContain('t("guidedTour.pendingFinance")');
    // The tour still starts by itself only on the hotel pages, and only hotel + rooms decide that.
    expect(shell).toContain("const tourActive = onAutoStartRoute && autoStart;");
    expect(read("../../components/hotel/HotelPaymentSettings.tsx")).toContain('data-tour="finance-settings"');
    expect(read("../../lib/tour/tourProgress.ts")).toContain("shouldAutoStart: !(hotelSettingsDone && roomsDone)");
  });
});
