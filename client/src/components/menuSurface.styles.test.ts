import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Shared menu surface contract", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const dropdownPrimitive = readFileSync(
    resolve(process.cwd(), "client/src/components/ui/dropdown-menu.tsx"),
    "utf8",
  );

  it("keeps custom menus opaque, layered, and collision-safe on mobile", () => {
    const surface = css.match(/\.menu-surface\{([^}]*)\}/)?.[1] ?? "";
    const topbar = css.match(/\.menu-surface--topbar\{([^}]*)\}/)?.[1] ?? "";
    const mobile = css.match(/@media \(max-width:640px\)\{\.menu-surface--topbar\{([^}]*)\}/)?.[1] ?? "";

    expect(surface).toContain("position:absolute");
    expect(surface).toContain("z-index:100");
    expect(surface).toContain("background:var(--white)!important");
    expect(surface).toContain("opacity:1!important");
    expect(surface).toContain("backdrop-filter:none");
    expect(topbar).toContain("right:0");
    expect(mobile).toContain("min-width:204px");
  });

  it("applies the shared opaque surface to Radix dropdown content", () => {
    expect(dropdownPrimitive).toContain('"menu-surface');
    expect(dropdownPrimitive).toContain("bg-[var(--white)]!");
    expect(dropdownPrimitive).toContain("z-[100]");
  });
});
