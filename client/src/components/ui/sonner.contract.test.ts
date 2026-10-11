import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("global toast contrast", () => {
  it("uses an opaque surface and explicit readable colors", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/ui/sonner.tsx"), "utf8");

    expect(source).toContain('"--normal-bg": "#ffffff"');
    expect(source).toContain('"--normal-text": "#1b1c1c"');
    expect(source).toContain('"--normal-border": "#d9d2ce"');
    expect(source).not.toContain('"--normal-bg": "var(--popover)"');
  });
});
