import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Topbar menu surface contract", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/components/layout/AppShell.tsx"), "utf8");
  const topbar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Topbar.tsx"), "utf8");

  it("uses a shared anchor and opaque surface for the Add menu", () => {
    // The Add menu markup moved into Topbar during the Phase 4 shell refactor.
    expect(topbar).toContain('className="dropdown-anchor"');
    expect(topbar).toContain('className="menu-surface menu-surface--compact menu-surface--topbar"');
    expect(topbar).toContain('aria-label="Add new menu"');
  });

  it("closes competing menus before opening the Add or Profile menu", () => {
    // AppShell still coordinates mutual exclusion between topbar menus and the workspace menu.
    expect(app).toContain("setUserMenuOpen(false); setWorkspaceMenuOpen(false);");
    expect(app).toContain("setAddMenuOpen(false); setWorkspaceMenuOpen(false);");
    // The ProfileMenu surface is now rendered inside Topbar.
    expect(topbar).toContain("<ProfileMenu");
  });
});
