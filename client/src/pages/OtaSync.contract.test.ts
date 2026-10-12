import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "OtaSync.tsx"), "utf8");

describe("OtaSync page contract", () => {
  it("registers the built-in outbound iCal export affordance", () => {
    expect(pageSource).toContain("/api/ical/");
    expect(pageSource).toContain("buildIcalExportUrl");
    expect(pageSource).toContain('t("otaSync.ownExportUrlLabel")');
  });

  it("keeps the Sync Now trigger wired to the permission-gated tRPC procedure", () => {
    expect(pageSource).toContain("channelManager.ota.triggerSync");
  });
});
