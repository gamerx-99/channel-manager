import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");

describe("Sidebar booking engine button", () => {
  it("keeps the booking engine destination in Website Builder instead of the sidebar", () => {
    expect(sidebar).not.toContain('t("sidebar.bookingEngines")');
    expect(sidebar).not.toContain("#book");
  });

  it("has no Channel analytics link", () => {
    expect(sidebar).not.toContain("/dashboard/channels");
  });
});
