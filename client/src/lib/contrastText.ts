/** Choose the higher WCAG contrast against a solid hotel accent. */
export function getContrastText(background: string): "#000000" | "#ffffff" {
  const hex = background.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new Error("Hotel accent must be a hex color");
  }
  const expanded = hex.length === 3 ? hex.split("").map(digit => digit + digit).join("") : hex;
  const channels = [0, 2, 4].map(index => {
    const srgb = parseInt(expanded.slice(index, index + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}
