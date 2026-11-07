import { describe, expect, it } from "vitest";
import { DEFAULT_HOTEL_COLORS, HOTEL_THEMES, getHotelThemeColors, themeDisplay } from "./hotelThemes";

describe("hotel theme colours", () => {
  it("uses brand names without changing theme ids", () => {
    expect(HOTEL_THEMES.map(theme => [theme.id, theme.name.brand])).toEqual([
      ["minimal-white", "Pure"],
      ["lanna-teak", "Warm Wood"],
      ["cafe-homestay", "Café Slow"],
      ["mountain-mist", "Terra"],
      ["boutique-noir", "Noir Luxe"],
      ["hostel-pop", "Vivid Pop"],
      ["riverside-calm", "Serene"],
      ["vintage-old-town", "Postcard"],
    ]);
  });

  it("has complete bilingual display copy for every theme", () => {
    expect(HOTEL_THEMES.map(theme => [theme.id, theme.name.th])).toEqual([
      ["minimal-white", "เพียว"],
      ["lanna-teak", "วอร์ม วู้ด"],
      ["cafe-homestay", "คาเฟ่ สโลว์"],
      ["mountain-mist", "เทอร์ร่า"],
      ["boutique-noir", "นัวร์ ลักซ์"],
      ["hostel-pop", "วิวิด ป๊อป"],
      ["riverside-calm", "เซรีน"],
      ["vintage-old-town", "โพสต์การ์ด"],
    ]);
    for (const theme of HOTEL_THEMES) {
      for (const language of ["th", "en"] as const) {
        const display = themeDisplay(theme, language);
        for (const value of [display.name, display.brand, display.description, display.suits]) expect(value.trim()).not.toBe("");
        expect(display.name).toBe(language === "th" ? `${theme.name.brand} - ${theme.name.th}` : theme.name.brand);
        expect(display.reading).toBe(language === "th" ? theme.name.th : null);
      }
      expect(theme.name.th).not.toMatch(/^สไตล์/);
    }
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
