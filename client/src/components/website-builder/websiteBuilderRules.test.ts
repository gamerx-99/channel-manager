import { describe, expect, it } from "vitest";
import { defaultConfig, nextTabIndex, themeSaveErrorMessage } from "./websiteBuilderRules";

describe("website builder rules", () => {
  it("returns the existing default site config for a hotel", () => {
    expect(defaultConfig("hotel-1")).toEqual({
      hotelId: "hotel-1",
      theme: null,
      heroCopy: "Explore room types, rates, and availability directly from this hotel.",
      visibleSections: { hero: true, story: true, rooms: true, booking: true, location: true },
    });
  });

  it("localizes theme save errors that mention a photo position", () => {
    expect(themeSaveErrorMessage('{"path":["media_positions","photo-id"],"code":"invalid_format"}', "Photo position is invalid.")).toBe("Photo position is invalid.");
    expect(themeSaveErrorMessage("A different save error", "Photo position is invalid.")).toBe("A different save error");
  });
});

describe("builder tab keyboard navigation", () => {
  it("moves between tabs with the arrow keys and wraps around", () => {
    expect(nextTabIndex("ArrowRight", 0, 4)).toBe(1);
    expect(nextTabIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 1, 4)).toBe(3);
  });

  it("ignores other keys", () => {
    expect(nextTabIndex("Enter", 1, 4)).toBeNull();
    expect(nextTabIndex("a", 1, 4)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
