import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Owner decision 2026-11-11: 2FA is back, optional for every role, and people turn it on and off themselves.
describe("2FA is optional and self-service", () => {
  it("shows the 2FA section on the security page for everyone, with no feature flag", () => {
    const page = read("client/src/pages/SecuritySettings.tsx");
    expect(page).toContain("<MfaSettings />");
    expect(page).not.toMatch(/isMfaEnabled|VITE_FEATURE_MFA/);
    expect(read("client/src/lib/featureFlags.ts")).not.toMatch(/isMfaEnabled|VITE_FEATURE_MFA/);
  });

  it("does not repeat the section on the account page", () => {
    expect(read("client/src/pages/Account.tsx")).not.toContain("MfaSettings");
  });

  it("lets a person turn it on and off with their password", () => {
    const settings = read("client/src/components/MfaSettings.tsx");
    expect(settings).toContain("authClient.twoFactor.enable({ password })");
    expect(settings).toContain("authClient.twoFactor.disable({ password })");
  });

  it("never sends anyone to enrol: no redirect from login or the private route, no enrol route", () => {
    expect(read("client/src/pages/Login.tsx")).not.toMatch(/mfa\/enroll|MFA_ENROLL_PATH|shouldEnforceMfaForRoles/);
    expect(read("client/src/components/auth/PrivateRoute.tsx")).not.toMatch(/mfa\/enroll|MFA_ENROLL_PATH|shouldRedirectToMfaEnroll/);
    expect(read("client/src/App.tsx")).not.toContain("/mfa/enroll");
    expect(read("client/src/lib/mfa.ts")).not.toMatch(/shouldEnforceMfaForRoles|shouldRedirectToMfaEnroll/);
  });

  it("still asks for the code when 2FA is on", () => {
    expect(read("client/src/pages/Login.tsx")).toContain("twoFactorRedirect");
    expect(read("server/socialAuth.ts")).toContain("requireTwoFactorOnSocialCallback");
  });
});
