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
    // The fields spotlight lives in the hook; GuidedTour no longer looks for the fields to decide whether to click the link.
    expect(read("../../components/tour/useGuidedTour.ts")).toContain('[data-tour="hotel-settings-fields"]');
    expect(guidedTour).toContain('if (step.target === "hotel-settings") onRoomStep();');
    expect(guidedTour).not.toContain('guided-tour:close-hotel-editor');
    expect(read("../../components/layout/AppShell.tsx")).toContain('location === `/hotels/${selectedHotelId}/profile`');
    expect(read("../../components/layout/AppShell.tsx")).toContain('location === `/hotels/${selectedHotelId}/settings/general`');
    expect(read("../../components/layout/AppShell.tsx")).toContain("window.sessionStorage.setItem(TOUR_STEP_KEY, 'rooms')");
    expect(read("../../components/tour/useGuidedTour.ts")).toContain("const RESUME_STEP: Record<string, number> = { rooms: 1, finance: 2 };");
    expect(read("../../pages/HotelProfile.tsx")).toContain('data-tour="hotel-settings-fields"');
    const hotel = read("../../pages/HotelDetail.tsx");
    expect(hotel).toContain('data-tour="room-settings"');
    expect(read("../../components/tour/GuidedTour.tsx")).toContain('t("guidedTour.skip")');
  });

  it("never navigates for the person: it opens the sidebar group and the person clicks the link", () => {
    const guidedTour = read("../../components/tour/GuidedTour.tsx");
    // The only click the tour makes is on the group toggle, never on the "General settings" link itself.
    expect(guidedTour.match(/\.click\(\)/g)).toHaveLength(1);
    expect(guidedTour).toContain('querySelector<HTMLElement>(\'[aria-controls="sidebar-hotel-settings"]\')?.click()');
    expect(guidedTour).not.toMatch(/target\.click\(\)/);
    expect(guidedTour).not.toContain("activateTarget");
  });

  it("counts the general settings page as a tour page and opens at the step the progress points to", () => {
    const shell = read("../../components/layout/AppShell.tsx");
    expect(shell).toContain("const onHotelDetailsPage = location === `/hotels/${selectedHotelId}/profile` || location === `/hotels/${selectedHotelId}/settings/general`;");
    expect(shell).toMatch(/const onTourRoute = [^;]*onHotelDetailsPage[^;]*settings\/finance/);
    expect(shell).toContain("const startStep = tourStartStep(progress);");
    expect(shell).toContain("startStep={startStep}");
    // A new owner is sent to the page of the first step to do: details first, otherwise the room types page.
    expect(shell).toContain("navigate(progress.hotelSettingsDone ? `/hotels/${selectedHotelId}` : `/hotels/${selectedHotelId}/settings/general`)");
    expect(read("../../components/tour/GuidedTour.tsx")).toContain("useGuidedTour(steps, active, onFinish, startStep)");
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
