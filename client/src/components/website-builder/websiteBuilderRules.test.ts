import { describe, expect, it } from "vitest";
import { defaultConfig, isValidHexColor } from "./websiteBuilderRules";

describe("website builder rules", () => {
  it("returns the existing default site config for a hotel", () => {
    expect(defaultConfig("hotel-1")).toEqual({
      hotelId: "hotel-1",
      theme: null,
      heroCopy: "Explore room types, rates, and availability directly from this hotel.",
      accentColor: "#1d6b56",
      visibleSections: { hero: true, story: true, rooms: true, booking: true, location: true },
    });
  });

  it("accepts trimmed six digit hex colors and rejects other formats", () => {
    expect(isValidHexColor(" #aBc123 ")).toBe(true);
    expect(isValidHexColor("#abc1234")).toBe(false);
    expect(isValidHexColor("red")).toBe(false);
  });
});
