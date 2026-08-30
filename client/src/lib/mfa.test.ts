import { describe, expect, it } from "vitest";
import { hasVerifiedTotpFactor, MFA_ENROLL_PATH, shouldEnforceMfaForRoles, shouldRedirectToMfaEnroll } from "./mfa";

describe("mfa helpers", () => {
  it("exposes the blocking enroll path", () => {
    expect(MFA_ENROLL_PATH).toBe("/mfa/enroll");
  });

  it("detects verified totp factors", () => {
    expect(hasVerifiedTotpFactor(null)).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [], all: [] })).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [{ status: "unverified" }] })).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [{ status: "verified" }] })).toBe(true);
    expect(hasVerifiedTotpFactor({ all: [{ factor_type: "totp", status: "verified" }] })).toBe(true);
    expect(hasVerifiedTotpFactor({ all: [{ factor_type: "phone", status: "verified" }] })).toBe(false);
  });

  it("enforces MFA only for platform roles", () => {
    expect(shouldEnforceMfaForRoles(["super_admin"])).toBe(true);
    expect(shouldEnforceMfaForRoles(["admin"])).toBe(true);
    expect(shouldEnforceMfaForRoles(["hotel_owner"])).toBe(false);
    expect(shouldEnforceMfaForRoles(["front_desk"])).toBe(false);
    expect(shouldEnforceMfaForRoles([])).toBe(false);
    expect(shouldEnforceMfaForRoles(null)).toBe(false);
  });

  it("redirects to enroll only when platform role lacks verified factor", () => {
    expect(shouldRedirectToMfaEnroll(["super_admin"], { totp: [] })).toBe(true);
    expect(shouldRedirectToMfaEnroll(["super_admin"], { totp: [{ status: "verified" }] })).toBe(false);
    expect(shouldRedirectToMfaEnroll(["hotel_owner"], { totp: [] })).toBe(false);
  });
});
