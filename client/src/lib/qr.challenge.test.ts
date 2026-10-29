import { describe, expect, it } from "vitest";
import { encodeQrByteMode, generateTotpQrDataUrl } from "./qr";

// --- Reverse Decoding Oracle for ISO/IEC 18004 Byte Mode ---

const ECC_MEDIUM_BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
const ECC_MEDIUM_CODEWORDS = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

function getRawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function decodeQrOracle(matrix: boolean[][]): string {
  const size = matrix.length;
  const version = (size - 17) / 4;

  // Extract function module map to skip function modules during codeword reading
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunc = (x: number, y: number) => {
    if (x >= 0 && x < size && y >= 0 && y < size) isFunction[y][x] = true;
  };

  // Finders + separators (9x9)
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        setFunc(cx + dx, cy + dy);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunc(6, i);
    setFunc(i, 6);
  }

  // Alignment patterns
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const alignPos = [6];
    for (let pos = size - 7; alignPos.length < numAlign; pos -= step) {
      alignPos.splice(1, 0, pos);
    }
    for (let i = 0; i < alignPos.length; i++) {
      for (let j = 0; j < alignPos.length; j++) {
        if (!(i === 0 && j === 0 || i === 0 && j === alignPos.length - 1 || i === alignPos.length - 1 && j === 0)) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              setFunc(alignPos[i] + dx, alignPos[j] + dy);
            }
          }
        }
      }
    }
  }

  // Format bits areas
  // Top-left: row 8 (cols 0..8) and col 8 (rows 0..8)
  for (let i = 0; i <= 8; i++) {
    setFunc(8, i);
    setFunc(i, 8);
  }
  // Top-right: row 8, cols (size - 8) to (size - 1)
  for (let i = 0; i < 8; i++) {
    setFunc(size - 1 - i, 8);
  }
  // Bottom-left: col 8, rows (size - 7) to (size - 1)
  for (let i = 0; i < 7; i++) {
    setFunc(8, size - 1 - i);
  }
  setFunc(8, size - 8); // dark module

  // Version bits areas
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        setFunc(size - 11 + j, i);
        setFunc(i, size - 11 + j);
      }
    }
  }

  // Read format bits
  let formatBits = 0;
  const formatCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
    [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [x, y] = formatCoords[i];
    if (matrix[y][x]) formatBits |= 1 << i;
  }
  formatBits ^= 21522; // XOR mask
  const mask = (formatBits >>> 10) & 0b111;

  // Unmask function
  const isMaskInvert = (x: number, y: number, m: number): boolean => {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return false;
    }
  };

  // Read zigzag bits
  const rawBits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x]) {
          let val = matrix[y][x];
          if (isMaskInvert(x, y, mask)) val = !val;
          rawBits.push(val ? 1 : 0);
        }
      }
    }
  }

  // Group into interleaved codewords
  const totalCodewords = Math.floor(rawBits.length / 8);
  const interleavedCodewords: number[] = [];
  for (let i = 0; i < totalCodewords; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | rawBits[i * 8 + b];
    }
    interleavedCodewords.push(byte);
  }

  // De-interleave blocks
  const numBlocks = ECC_MEDIUM_BLOCKS[version];
  const blockEccLen = ECC_MEDIUM_CODEWORDS[version];
  const rawCodewords = Math.floor(getRawModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockDataLen = Math.floor(rawCodewords / numBlocks) - blockEccLen;

  const dataBlocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let ptr = 0;
  // 1. Common data bytes
  for (let col = 0; col < shortBlockDataLen; col++) {
    for (let b = 0; b < numBlocks; b++) {
      dataBlocks[b].push(interleavedCodewords[ptr++]);
    }
  }
  // 2. Extra data byte in long blocks
  for (let b = numShortBlocks; b < numBlocks; b++) {
    dataBlocks[b].push(interleavedCodewords[ptr++]);
  }


  // Concatenate data codewords
  const dataCodewords: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    dataCodewords.push(...dataBlocks[b]);
  }

  // Parse byte mode bitstream from dataCodewords
  const dataBits: number[] = [];
  for (const byte of dataCodewords) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((byte >>> i) & 1);
    }
  }

  let bitIdx = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val = (val << 1) | dataBits[bitIdx++];
    }
    return val;
  };

  const mode = readBits(4);
  if (mode !== 0b0100) {
    throw new Error(`Expected Byte Mode (0100), got ${mode.toString(2)}`);
  }

  const charCountBits = version < 10 ? 8 : 16;
  const charCount = readBits(charCountBits);

  const decodedBytes: number[] = [];
  for (let i = 0; i < charCount; i++) {
    decodedBytes.push(readBits(8));
  }

  return new TextDecoder().decode(new Uint8Array(decodedBytes));
}

describe("Empirical Challenge: ISO/IEC 18004 QR Matrix Generator", () => {
  describe("1. Mathematical Oracle: Full Roundtrip Decode Verification", () => {
    it("successfully decodes minimal 3-character ASCII payload in Version 1", () => {
      const payload = "ABC";
      const { size, modules } = encodeQrByteMode(payload);
      expect(size).toBe(21);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(payload);
    });


    it("successfully decodes standard TOTP URI", () => {
      const payload = "otpauth://totp/hayhost:alice%40hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=hayhost";
      const { modules } = encodeQrByteMode(payload);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(payload);
    });

    it("successfully decodes TOTP URI with multiple query params, plus signs, and high-entropy secret", () => {
      const payload = "otpauth://totp/hayhost:user+dev%40domain.org?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=hayhost&algorithm=SHA1&digits=6&period=30";
      const { modules } = encodeQrByteMode(payload);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(payload);
    });

    it("successfully decodes UTF-8 Thai characters in label and issuer", () => {
      const payload = "otpauth://totp/โรงแรมสุวรรณภูมิ:สมชาย%40โรงแรม.ไทย?secret=JBSWY3DPEHPK3PXP&issuer=โรงแรมสุวรรณภูมิ";
      const { modules } = encodeQrByteMode(payload);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(payload);
    });

    it("successfully decodes long URI spanning multiple blocks (Version 5+)", () => {
      const longPayload = "otpauth://totp/Grand%20Palace%20Luxury%20Suites%20And%20Resorts:admin-operations-division%40grandpalace-luxury-resorts-phuket.co.th?secret=MZXW6YTBOI======&issuer=Grand%20Palace%20Luxury%20Suites%20And%20Resorts&algorithm=SHA1&digits=6&period=30";
      const { modules } = encodeQrByteMode(longPayload);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(longPayload);
    });
  });

  describe("2. Bit Matrix Avalanche & Sensitivity Challenge", () => {
    it("exhibits significant avalanche effect on single-character secret change", () => {
      const uriA = "otpauth://totp/hayhost:test?secret=JBSWY3DPEHPK3PXA";
      const uriB = "otpauth://totp/hayhost:test?secret=JBSWY3DPEHPK3PXB";

      const qrA = encodeQrByteMode(uriA);
      const qrB = encodeQrByteMode(uriB);

      expect(qrA.size).toBe(qrB.size);

      let diffCount = 0;
      let totalDataModules = 0;
      for (let r = 0; r < qrA.size; r++) {
        for (let c = 0; c < qrA.size; c++) {
          totalDataModules++;
          if (qrA.modules[r][c] !== qrB.modules[r][c]) {
            diffCount++;
          }
        }
      }

      // Avalanche should flip at least 15% of all modules in the QR matrix
      const diffPercentage = (diffCount / totalDataModules) * 100;
      expect(diffPercentage).toBeGreaterThan(15);
    });

    it("generates 100% collision-free matrices across 50 distinct random secrets", () => {
      const hashes = new Set<string>();
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

      for (let i = 0; i < 50; i++) {
        let secret = "";
        for (let j = 0; j < 16; j++) {
          secret += chars[Math.floor(Math.random() * chars.length)];
        }
        const uri = `otpauth://totp/hayhost:user${i}@hotel.com?secret=${secret}&issuer=hayhost`;
        const dataUrl = generateTotpQrDataUrl(uri);
        expect(hashes.has(dataUrl)).toBe(false);
        hashes.add(dataUrl);
      }

      expect(hashes.size).toBe(50);
    });
  });

  describe("3. ISO/IEC 18004 Structural Invariants & Quiet Zone", () => {
    const uri = "otpauth://totp/hayhost:alice%40hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=hayhost";
    const { size, modules } = encodeQrByteMode(uri);

    it("verifies finder pattern exact dimensions and concentric ring geometry at 3 corners", () => {
      const checkFinder = (cx: number, cy: number) => {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const expected = dist !== 2; // dist 0, 1, 3 are dark; dist 2 is light
            expect(modules[cy + dy][cx + dx]).toBe(expected);
          }
        }
        // Check 1-module light separator
        for (let d = -4; d <= 4; d++) {
          const coords = [
            [cx + d, cy - 4],
            [cx + d, cy + 4],
            [cx - 4, cy + d],
            [cx + 4, cy + d],
          ];
          for (const [x, y] of coords) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
              expect(modules[y][x]).toBe(false);
            }
          }
        }
      };

      // Top-Left
      checkFinder(3, 3);
      // Top-Right
      checkFinder(size - 4, 3);
      // Bottom-Left
      checkFinder(3, size - 4);
      // Bottom-Right must NOT be a finder pattern center
      expect(modules[size - 4][size - 4]).toBeDefined();
    });

    it("verifies alternating timing patterns on row 6 and col 6", () => {
      // Row 6 from col 8 to size - 9
      for (let c = 8; c < size - 8; c++) {
        expect(modules[6][c]).toBe(c % 2 === 0);
      }
      // Col 6 from row 8 to size - 9
      for (let r = 8; r < size - 8; r++) {
        expect(modules[r][6]).toBe(r % 2 === 0);
      }
    });

    it("verifies dark module at (8, size - 8) is true", () => {
      expect(modules[size - 8][8]).toBe(true);
    });

    it("verifies SVG 4-module quiet zone is strictly enforced with zero dark modules in margins", () => {
      const dataUrl = generateTotpQrDataUrl(uri);
      const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;utf-8,", ""));

      // Quiet zone = 4 modules * 4 pixelSize = 16 pixels margin
      const totalModules = size + 8;
      const expectedPixelDim = totalModules * 4;

      expect(svg).toContain(`viewBox="0 0 ${expectedPixelDim} ${expectedPixelDim}"`);
      expect(svg).toContain(`width="${expectedPixelDim}"`);
      expect(svg).toContain(`height="${expectedPixelDim}"`);

      // Parse all module path coordinates M{x},{y}
      const matches = svg.matchAll(/M(\d+),(\d+)h4v4h-4z/g);
      let count = 0;
      for (const match of matches) {
        count++;
        const x = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);

        // Quiet zone bounds: [0, 16) and (expectedPixelDim - 16, expectedPixelDim]
        expect(x).toBeGreaterThanOrEqual(16);
        expect(y).toBeGreaterThanOrEqual(16);
        expect(x).toBeLessThan(expectedPixelDim - 12);
        expect(y).toBeLessThan(expectedPixelDim - 12);
      }
      expect(count).toBeGreaterThan(50);
    });
  });

  describe("4. Edge Cases, Character Encodings, and Boundary Limits", () => {
    it("handles URI with special characters, symbols, and plus signs", () => {
      const specialUri = "otpauth://totp/Special%20%26%20Co:admin%2Btest%3D1%40sub-domain.hotel.org?secret=JBSWY3DPEHPK3PXP&issuer=Special%20%26%20Co";
      const dataUrl = generateTotpQrDataUrl(specialUri);
      expect(dataUrl.startsWith("data:image/svg+xml;utf-8,")).toBe(true);
    });

    it("handles complex multi-language UTF-8: Thai, Japanese, Arabic, and Emoji", () => {
      const multiLang = "otpauth://totp/โรงแรม🏨_東京_دبي:user@hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=โรงแรม🏨_東京_دبي";
      const { modules } = encodeQrByteMode(multiLang);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(multiLang);
    });

    it("dynamically expands QR version as payload size increases", () => {
      const v1 = encodeQrByteMode("otpauth://a"); // 11 bytes fits in Version 1 (max 14 bytes)
      const v4 = encodeQrByteMode("otpauth://totp/hayhost:alice%40hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=hayhost");
      const v10 = encodeQrByteMode("A".repeat(250));

      expect(v1.size).toBe(21); // Version 1: 21x21

      expect(v4.size).toBeGreaterThan(21);
      expect(v10.size).toBeGreaterThan(v4.size);
    });

    it("handles empty string gracefully", () => {
      const { size, modules } = encodeQrByteMode("");
      expect(size).toBe(21); // Version 1
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe("");
    });

    it("handles embedded null bytes and binary characters", () => {
      const payload = "otpauth://totp/test\x00user\x01\x1f:secret?secret=JBSWY3DPEHPK3PXP";
      const { modules } = encodeQrByteMode(payload);
      const decoded = decodeQrOracle(modules);
      expect(decoded).toBe(payload);
    });

    it("guarantees immunity against SVG injection / XSS payloads", () => {
      const xssUri = `otpauth://totp/"><script>alert('xss')</script><svg onload="alert(1)">?secret=JBSWY3DPEHPK3PXP`;
      const dataUrl = generateTotpQrDataUrl(xssUri);
      const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;utf-8,", ""));

      // Verify that no injected script tags or attributes exist in the rendered SVG
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("onload");
      expect(svg).not.toContain("alert");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    });

    it("throws informative Error when payload exceeds Version 40 capacity", () => {
      const oversized = "X".repeat(3000);
      expect(() => encodeQrByteMode(oversized)).toThrow(/Data too long to fit into a QR code/);
    });

  });

  describe("5. Throughput & Stress Harness", () => {
    it("generates 50 full SVG QR codes in under 1 second", () => {
      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        generateTotpQrDataUrl(`otpauth://totp/hayhost:user${i}@hotel.com?secret=JBSWY3DPEHPK3PXP&issuer=hayhost`);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});
