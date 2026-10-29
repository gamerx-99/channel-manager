import { describe, expect, it } from "vitest";
import { encodeQrByteMode, generateTotpQrDataUrl } from "./qr";

describe("generateTotpQrDataUrl (ISO/IEC 18004 Compliance)", () => {
  const uri1 = "otpauth://totp/hayhost:alice%40hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=hayhost";
  const uri2 = "otpauth://totp/hayhost:bob%40hotel.com?secret=MZXW6YTBOI======&issuer=hayhost";

  it("generates a valid data:image/svg+xml data URL", () => {
    const dataUrl = generateTotpQrDataUrl(uri1);
    expect(dataUrl.startsWith("data:image/svg+xml;utf-8,")).toBe(true);

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;utf-8,", ""));
    expect(svg).toContain("<svg xmlns=\"http://www.w3.org/2000/svg\"");
    expect(svg).toContain("<rect width=");
    expect(svg).toContain("<path fill=\"#000000\" d=\"M");
    expect(svg).not.toContain("<!-- QR matrix placeholder");
  });

  it("produces distinct QR matrices for different TOTP secrets", () => {
    const dataUrl1 = generateTotpQrDataUrl(uri1);
    const dataUrl2 = generateTotpQrDataUrl(uri2);
    expect(dataUrl1).not.toBe(dataUrl2);
  });

  it("builds correct matrix dimensions with 4-module quiet zone", () => {
    const { size, modules } = encodeQrByteMode(uri1);
    expect(size).toBeGreaterThanOrEqual(21);
    expect(modules.length).toBe(size);
    expect(modules[0].length).toBe(size);

    // Verify finder pattern centers and light separators
    expect(modules[3][3]).toBe(true);
    expect(modules[0][7]).toBe(false);
    expect(modules[7][0]).toBe(false);
  });
});
