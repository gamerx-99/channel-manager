import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workspace dropdown layering contract", () => {
  it("keeps the dropdown opaque, positioned above navigation, and bounded on small screens", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    const anchor = css.match(/\.workspace-menu-anchor\{([^}]*)\}/)?.[1] ?? "";
    const dropdown = css.match(/\.workspace-dropdown\{([^}]*)\}/)?.[1] ?? "";
    const item = css.match(/\.workspace-dropdown-item\{([^}]*)\}/)?.[1] ?? "";

    expect(anchor).toContain("position:relative");
    expect(dropdown).toContain("position:absolute");
    expect(dropdown).toContain("z-index:100");
    expect(dropdown).toContain("background:var(--white)");
    expect(dropdown).toContain("overflow-y:auto");
    expect(dropdown).toContain("calc(100vw - 32px)");
    expect(item).toContain("background:var(--white)");
  });
});
