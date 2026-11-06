import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PublicHotel.tsx"), "utf8");
const themeData = readFileSync(resolve(process.cwd(), "client/src/components/public-hotel/usePublicHotelPage.ts"), "utf8");
describe("PublicHotel stored theme rendering", () => {
  it("uses the theme registry and falls back to the existing page when no theme is registered", () => {
    expect(page).toContain("getHotelThemeRegistryEntry(selectedTheme)");
    expect(page).toContain("if (!themeEntry) return content;");
  });
});

describe.each([
  ["MinimalWhiteLanding", "minimal-white"],
  ["LannaTeakLanding", "lanna-teak"],
  ["CafeHomestayLanding", "cafe-homestay"],
  ["MountainMistLanding", "mountain-mist"],
])("%s contract", (component, id) => {
  it("does not include never-render content and declares a Thai font pair", () => {
    const source = readFileSync(resolve(process.cwd(), `client/src/components/hotel-themes/${id}/${component.replace("Landing", "")}.tsx`), "utf8") + readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/ThemeLanding.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/themes.css"), "utf8");
    for (const banned of ["reviews", "stars", "phone", "LINE", ...(id === "mountain-mist" ? [] : ["amenities"]), "bank transfer", "festival dates", "/logo-mark.svg"]) expect(source.toLowerCase()).not.toContain(banned.toLowerCase());
    expect(source).toContain("ThemeLanding");
    expect(css).toContain(`.theme-${id}`);
    expect(source).toContain("Thai");
  });
});
