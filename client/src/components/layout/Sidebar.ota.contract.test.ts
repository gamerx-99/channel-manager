import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("OTA UI flag contract", () => {
  it("gates the sidebar entry and dashboard widget, and redirects the disabled route", () => {
    expect(sidebar).toContain("otaSyncEnabled && can(\"ota.view_status\")");
    expect(home).toContain("otaSyncEnabled && <OtaSyncStatusWidget");
    expect(app).toContain("otaSyncEnabled ? <PrivateRoute>");
  });
});
