import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(resolve(process.cwd(), "client/src/components/layout/AppShell.tsx"), "utf8");

describe("AppShell payment setup reminder", () => {
  it("is mounted once, for the hotel owner only, and waits while the tour is showing", () => {
    expect(shell.match(/<PaymentSetupReminder/g)).toHaveLength(1);
    expect(shell).toContain('<PaymentSetupReminder hotelId={selectedHotelId ?? null} enabled={isHotelOwner && !tourShowing} />');
    expect(shell).toContain('m.role === "hotel_owner"');
    expect(shell).toContain("const tourShowing = onTourRoute && (tourActive || tourRequested);");
  });

  it("never reaches platform roles, who cannot fix a hotel's payment settings", () => {
    expect(shell).toMatch(/isHotelOwner = [\s\S]*!roles\.some\(role => isPlatformRole\(role\)\)/);
  });
});
