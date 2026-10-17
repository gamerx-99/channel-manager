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

  // Regression: the export-URL button was gated on `conn.ical_export_url`, which
  // is only set when an OTA supplies one. Connections created from this page
  // never had it, so the dialog holding OUR .ics link was unreachable — the RONDMAP
  // A1 deliverable was invisible for exactly the hotels that need it.
  it("opens the export dialog without requiring an OTA-supplied export URL", () => {
    expect(pageSource).not.toMatch(/conn\.ical_export_url\s*&&\s*\(\s*<Button/);
    expect(pageSource).toMatch(/onClick=\{\(\)\s*=>\s*setExportUrlDialogConn\(conn\)\}/);
  });

  it("keeps the built-in URL block keyed on the feed token we own", () => {
    expect(pageSource).toContain("exportUrlDialogConn.ical_feed_token &&");
    expect(pageSource).toContain(
      "buildIcalExportUrl(exportUrlDialogConn.hotel_id, exportUrlDialogConn.ical_feed_token)",
    );
  });

  it("keeps the Sync Now trigger wired to the permission-gated tRPC procedure", () => {
    expect(pageSource).toContain("channelManager.ota.triggerSync");
  });
});
