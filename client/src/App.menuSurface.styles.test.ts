import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Topbar menu surface contract", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

  it("uses a shared anchor and opaque surface for the Add menu", () => {
    expect(app).toContain('className="dropdown-anchor"');
    expect(app).toContain('className="menu-surface menu-surface--compact menu-surface--topbar"');
    expect(app).toContain('aria-label="Add new menu"');
  });

  it("closes competing menus before opening the Add or Profile menu", () => {
    expect(app).toContain("setUserMenuOpen(false); setWorkspaceMenuOpen(false);");
    expect(app).toContain("setAddMenuOpen(false); setWorkspaceMenuOpen(false);");
    expect(app).toContain("<ProfileMenu");
  });
});
