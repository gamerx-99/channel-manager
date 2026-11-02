import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PublicHotel.tsx"), "utf8");
describe("PublicHotel stored theme rendering", () => {
  it("switches on all stored theme ids and falls back when null or unknown", () => {
    expect(page).toContain("isHotelThemeId(siteConfig?.theme)");
    expect(page).toContain('selectedTheme === "minimal-white"');
    expect(page).toContain('selectedTheme === "lanna-teak"');
    expect(page).toContain('selectedTheme === "cafe-homestay"');
    expect(page).toContain("return content;");
  });
});

describe.each([
  ["MinimalWhiteLanding", "minimal-white"],
  ["LannaTeakLanding", "lanna-teak"],
  ["CafeHomestayLanding", "cafe-homestay"],
])("%s contract", (component, id) => {
  it("does not include never-render content and declares a Thai font pair", () => {
    const source = readFileSync(resolve(process.cwd(), `client/src/components/hotel-themes/${component}.tsx`), "utf8") + readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/ThemeLanding.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/themes.css"), "utf8");
    for (const banned of ["reviews", "stars", "phone", "LINE", "amenities", "bank transfer", "festival dates", "/logo-mark.svg"]) expect(source.toLowerCase()).not.toContain(banned.toLowerCase());
    expect(source).toContain("ThemeLanding");
    expect(css).toContain(`.theme-${id}`);
    expect(source).toContain("Thai");
  });
});
