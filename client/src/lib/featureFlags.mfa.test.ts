import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMfaEnabled } from "./featureFlags";

const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("MFA feature flag", () => {
  it("is off unless the value is exactly 'true'", () => {
    expect(isMfaEnabled(undefined)).toBe(false);
    expect(isMfaEnabled("")).toBe(false);
    expect(isMfaEnabled("false")).toBe(false);
    expect(isMfaEnabled("true")).toBe(true);
  });

  it("gates the forced enrol redirects and the settings section", () => {
    expect(read("components/auth/PrivateRoute.tsx")).toMatch(/isMfaEnabled\(\) &&\s*isAuthenticated/);
    expect(read("pages/Login.tsx")).toContain("isMfaEnabled() && !twoFactorEnabled && shouldEnforceMfaForRoles(roles)");
    expect(read("pages/SecuritySettings.tsx")).toContain("{isMfaEnabled() && <MfaSettings />}");
  });
});
