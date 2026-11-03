import { describe, expect, it } from "vitest";
import { getContrastText } from "./contrastText";

function contrastRatio(background: string, foreground: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("hotel accent text", () => {
  it.each(["#000000", "#ffffff", "#954831", "#777777", "#ffdd00", "#abcdef", "#c0c0c0"]) (
    "chooses the higher-contrast text for %s at 4.5:1 or better",
    background => {
      const text = getContrastText(background);
      const alternative = text === "#000000" ? "#ffffff" : "#000000";
      expect(contrastRatio(background, text)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, text)).toBeGreaterThanOrEqual(contrastRatio(background, alternative));
    },
  );

  it("supports shorthand hex colors", () => {
    expect(getContrastText("#fff")).toBe("#000000");
    expect(getContrastText("#000")).toBe("#ffffff");
  });
});
