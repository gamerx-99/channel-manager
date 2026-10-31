import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "SecuritySettings.tsx"), "utf8");
const app = readFileSync(join(here, "../App.tsx"), "utf8");

describe("Security settings page contract", () => {
  it("is a registered private route", () => {
    expect(app).toContain('path="/settings/security"');
    expect(app).toContain("<PrivateRoute><SecuritySettings /></PrivateRoute>");
  });

  it("shows the SlipOK panel only to holders of property.manage_profile", () => {
    expect(page).toContain('"property.manage_profile"');
    expect(page).toContain("canManageSlipOk && <SlipOkSettings");
  });
});
