import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
describe("guided tour contract", () => {
  it("registers the signed-in guide, real targets, and skip control", () => {
    expect(read("../../App.tsx")).toContain('path="/help/getting-started"');
    const hotel = read("../../pages/HotelDetail.tsx");
    expect(hotel).toContain('data-tour="hotel-settings"');
    expect(hotel).toContain('data-tour="room-settings"');
    expect(read("../../components/tour/GuidedTour.tsx")).toContain('t("guidedTour.skip")');
  });
});
