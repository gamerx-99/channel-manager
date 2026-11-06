import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8");

describe("theme booking text colors", () => {
  it.each(["minimal-white", "lanna-teak", "cafe-homestay", "mountain-mist"]) ("defines booking heading and highlight colors for %s", theme => {
    expect(css).toMatch(new RegExp(`\\.theme-${theme} \\.public-booking h2[^\\{]*\\{[^}]*color:`));
    expect(css).toMatch(new RegExp(`\\.theme-${theme} \\.public-booking h2 i[^\\{]*\\{[^}]*color:`));
  });
  it("keeps hotel accent and computed text on calls to action in every theme", () => {
    for (const theme of ["minimal-white", "lanna-teak", "cafe-homestay", "mountain-mist"]) {
      expect(css).toContain(`.theme-${theme} .public-button`);
      expect(css).toContain(`.theme-${theme} .public-booking .booking-next`);
    }
    expect(css).toContain("background:var(--owner-accent)!important");
    expect(css).toContain("color:var(--owner-accent-text)!important");
    expect(css).not.toContain("--booking-calendar-accent:var(--t-primary)!important");
  });
});
