import { describe, expect, it } from "vitest";
import { DEFAULT_HOTEL_COLORS, HOTEL_THEMES, getHotelThemeColors } from "./hotelThemes";

describe("hotel theme colours", () => {
  it("uses the owner-approved style names without changing theme ids", () => {
    expect(HOTEL_THEMES.map(({ id, name }) => [id, name])).toEqual([
      ["minimal-white", "สไตล์มินิมอล"],
      ["lanna-teak", "สไตล์ล้านนา"],
      ["cafe-homestay", "สไตล์คาเฟ่"],
      ["mountain-mist", "สไตล์ธรรมชาติ"],
      ["boutique-noir", "สไตล์ลักชัวรี"],
    ]);
  });

  it("defines readable fixed button and highlight colours for every theme", () => {
    expect(HOTEL_THEMES).toHaveLength(5);
    for (const theme of HOTEL_THEMES) {
      expect(theme.buttonBackground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.highlight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toBe(theme.id === "mountain-mist" ? "#1f3b2d" : theme.id === "boutique-noir" ? "#141414" : "#ffffff");
    }
  });

  it("uses hayhost colours when the hotel has no recognized theme", () => {
    expect(getHotelThemeColors(null)).toEqual(DEFAULT_HOTEL_COLORS);
  });
});
