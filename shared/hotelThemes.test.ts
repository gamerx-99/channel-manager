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
      ["hostel-pop", "สไตล์ป๊อปอาร์ต"],
      ["riverside-calm", "สไตล์รีสอร์ท"],
      ["vintage-old-town", "สไตล์วินเทจ"],
    ]);
  });

  it("defines readable fixed button and highlight colours for every theme", () => {
    expect(HOTEL_THEMES).toHaveLength(8);
    for (const theme of HOTEL_THEMES) {
      expect(theme.buttonBackground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.highlight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.buttonText).toBe(theme.id === "mountain-mist" ? "#1f3b2d" : theme.id === "boutique-noir" ? "#141414" : theme.id === "hostel-pop" ? "#000000" : "#ffffff");
    }
  });

  it("registers Hostel Pop as a premium theme with the design palette", () => {
    expect(HOTEL_THEMES.find(theme => theme.id === "hostel-pop")).toMatchObject({ tier: "premium", buttonBackground: "#ffd23f", buttonText: "#000000", highlight: "#fd5c8e" });
  });

  it("registers Riverside Calm as a premium theme with the design palette", () => {
    expect(HOTEL_THEMES.find(theme => theme.id === "riverside-calm")).toMatchObject({ tier: "premium", buttonBackground: "#0d575a", buttonText: "#ffffff", highlight: "#2f6f73" });
  });

  it("registers Vintage Old Town as a premium theme with the design palette", () => {
    expect(HOTEL_THEMES.find(theme => theme.id === "vintage-old-town")).toMatchObject({ tier: "premium", buttonBackground: "#c2562e", buttonText: "#ffffff", highlight: "#2e7c7a" });
  });

  it("uses hayhost colours when the hotel has no recognized theme", () => {
    expect(getHotelThemeColors(null)).toEqual(DEFAULT_HOTEL_COLORS);
  });
});
