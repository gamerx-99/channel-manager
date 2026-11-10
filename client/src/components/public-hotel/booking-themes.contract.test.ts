import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOTEL_THEMES } from "@shared/hotelThemes";

const css = readFileSync(new URL("./booking-themes.css", import.meta.url), "utf8");
const themeBlocks = [...css.matchAll(/\.booking-page\[data-booking-theme="([^"]+)"\]\s*\{([^}]*)\}/g)];

function colorToken(block: string, name: string): string {
  const value = block.match(new RegExp(`--bt-${name}:\s*(#[0-9a-fA-F]{3,6})(?:;|\s)`))?.[1];
  expect(value, `--bt-${name}`).toBeDefined();
  return value!.toLowerCase();
}

function luminance(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits;
  const [red, green, blue] = [0, 2, 4]
    .map(index => parseInt(full.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("booking theme buttons", () => {
  it("uses a primary fill distinct from the panel and AA text in every theme", () => {
    expect(themeBlocks.map(([, id]) => id).sort()).toEqual(HOTEL_THEMES.map(({ id }) => id).sort());
    for (const [, id, block] of themeBlocks) {
      const panel = colorToken(block, "surface");
      const fill = colorToken(block, "button");
      const text = colorToken(block, "button-text");
      expect(fill, `${id}: primary fill must differ from the panel`).not.toBe(panel);
      expect(contrastRatio(text, fill), `${id}: primary text must meet WCAG AA`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps hostel-pop's hard shadow and full black button border", () => {
    const hostel = themeBlocks.find(([, id]) => id === "hostel-pop")?.[2] ?? "";
    expect(colorToken(hostel, "button")).toBe("#fd5c8e");
    expect(hostel).toContain("--bt-button-shadow:4px 4px 0 #000");
    expect(css).toContain('.booking-page[data-booking-theme="hostel-pop"] .booking-action-button { border:3px solid #000; }');
    expect(css).toContain('.booking-page[data-booking-theme="hostel-pop"] .payment-slip-submit { border:3px solid #000; }');
    expect(css).toMatch(/\.booking-nav-row button:not\(\.booking-action-button\) \{[^}]*border:var\(--bt-border-width\) solid var\(--bt-border\)/);
    expect(css).toMatch(/\.booking-calendar \.rdp-button_next \{[^}]*border:var\(--bt-border-width\) solid var\(--bt-border\)/);
  });
});
