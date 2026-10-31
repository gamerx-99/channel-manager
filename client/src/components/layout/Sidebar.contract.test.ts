import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");

describe("Sidebar booking engine button", () => {
  it("opens the live page only for a published hotel and explains a private one", () => {
    expect(sidebar).toContain('toast.info(t("sidebar.bookingEnginesSelectPrompt"))');
    expect(sidebar).toContain("!hotel.public_enabled");
    expect(sidebar).toContain('toast.info(t("sidebar.bookingEnginesPrivatePrompt"))');
    expect(sidebar).toContain('window.open(`/${hotel.slug}#book`, "_blank", "noopener")');
  });

  it("has no Channel analytics link", () => {
    expect(sidebar).not.toContain("/dashboard/channels");
  });
});
