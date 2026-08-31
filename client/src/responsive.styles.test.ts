import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Responsive operations layout contract", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const staff = readFileSync(resolve(process.cwd(), "client/src/pages/HotelStaff.tsx"), "utf8");

  it("keeps the live AppShell sidebar closed by default on small screens and exposes an accessible open state", () => {
    expect(app).toContain('className={`sidebar ${open ? "is-open" : ""}`}');
    expect(app).toContain('className="mobile-scrim"');
    expect(app).toContain('aria-label="Open menu"');
    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.sidebar\{[^}]*transform:translateX\(-105%\)/);
    expect(css).toMatch(/\.sidebar\.is-open\{[^}]*transform:translateX\(0\)/);
  });

  it("uses a dedicated responsive surface for the Overview summary widget", () => {
    expect(home).toContain('className="panel dashboard-summary-panel"');
    expect(home).toContain('className="panel-heading dashboard-summary-heading"');
    expect(css).toContain(".dashboard-summary-panel");
    expect(css).toContain(".dashboard-summary-heading");
  });

  it("makes the staff ledger horizontally discoverable and keeps modal actions touch-friendly", () => {
    expect(staff).toContain('className="mobile-scroll-hint staff-scroll-hint"');
    expect(staff).toContain('className="data-table staff-table"');
    expect(css).toContain(".staff-table{min-width:760px}");
    expect(css).toContain(".modal-actions{flex-direction:column-reverse;gap:8px}");
    expect(css).toContain(".modal-actions .button{width:100%;justify-content:center;min-height:42px}");
  });
});
