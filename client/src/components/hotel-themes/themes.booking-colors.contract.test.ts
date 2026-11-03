import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8");

describe("theme booking text colors", () => {
  it.each(["minimal-white", "lanna-teak", "cafe-homestay"]) ("defines booking heading and highlight colors for %s", theme => {
    expect(css).toMatch(new RegExp(`\\.theme-${theme} \\.public-booking h2[^\\{]*\\{[^}]*color:`));
    expect(css).toMatch(new RegExp(`\\.theme-${theme} \\.public-booking h2 i[^\\{]*\\{[^}]*color:`));
  });
});
