import { describe, expect, it } from "vitest";
import { DEFAULT_HOTEL_COLORS, HOTEL_THEMES, getHotelThemeColors } from "./hotelThemes";

describe("hotel theme colours", () => {
  it("defines readable fixed button and highlight colours for every theme", () => {
    expect(HOTEL_THEMES).toHaveLength(3);
    for (const theme of HOTEL_THEMES) {
      expect(theme.buttonBackground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.highlight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toBe("#ffffff");
    }
  });

  it("uses hayhost colours when the hotel has no recognized theme", () => {
    expect(getHotelThemeColors(null)).toEqual(DEFAULT_HOTEL_COLORS);
  });
});
