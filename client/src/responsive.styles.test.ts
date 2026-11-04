import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Responsive operations layout contract", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/styles/layout.css"), "utf8") + readFileSync(resolve(process.cwd(), "client/src/styles/house-style.css"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/components/layout/AppShell.tsx"), "utf8");
  const topbar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Topbar.tsx"), "utf8");
  const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const staff = readFileSync(resolve(process.cwd(), "client/src/pages/HotelStaff.tsx"), "utf8");

  it("keeps the live AppShell sidebar closed by default on small screens and exposes an accessible open state", () => {
    expect(sidebar).toContain('className={`sidebar ${open ? "is-open" : ""}`}');
    expect(app).toContain('className="mobile-scrim"');
    // The hamburger button moved into Topbar during the Phase 4 shell refactor and uses i18n key topbar.openMenu.
    expect(topbar).toContain('aria-label={t("topbar.openMenu")}');
    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.sidebar\{[^}]*transform:translateX\(-105%\)/);
    expect(css).toMatch(/\.sidebar\.is-open\{[^}]*transform:translateX\(0\)/);
  });

  it("uses a dedicated responsive surface for the Overview summary widget", () => {
    // AGENTS.md Rule 6 rationale: Commit 35880ef redesigned the dashboard overview
    // from dashboard-summary-panel to a responsive, permission-gated metric-row / metric-card grid.
    expect(home).toContain('className="metric-row"');
    expect(home).toContain('className="metric-card"');
    expect(css).toContain(".metric-row");
    expect(css).toContain(".metric-card");
  });

  it("makes the staff ledger horizontally discoverable and keeps modal actions touch-friendly", () => {
    expect(staff).toContain('className="mobile-scroll-hint staff-scroll-hint"');
    expect(staff).toContain('className="data-table staff-table"');
    expect(css).toContain(".staff-table{min-width:760px}");
    expect(css).toContain(".modal-actions{flex-direction:column-reverse;gap:8px}");
    expect(css).toContain(".modal-actions .button{width:100%;justify-content:center;min-height:42px}");
  });
});
