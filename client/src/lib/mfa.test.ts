import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasVerifiedTotpFactor,
  MFA_ENROLL_PATH,
  shouldEnforceMfaForRoles,
  shouldRedirectToMfaEnroll,
  cleanupUnverifiedFactors,
  prepareTotpEnrollment,
  enrollTotpFactor,
} from "./mfa";

const mocks = vi.hoisted(() => {
  const listFactors = vi.fn();
  const enroll = vi.fn();
  const unenroll = vi.fn();
  const challenge = vi.fn();
  const verify = vi.fn();
  return { listFactors, enroll, unenroll, challenge, verify };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        challenge: mocks.challenge,
        verify: mocks.verify,
      },
    },
  },
}));

beforeEach(() => {
  mocks.listFactors.mockReset();
  mocks.enroll.mockReset();
  mocks.unenroll.mockReset();
  mocks.challenge.mockReset();
  mocks.verify.mockReset();
});

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

describe("MFA Enrollment and Cleanup flow", () => {
  it("successfully performs clean enrollment when no factors exist", async () => {
    mocks.listFactors.mockResolvedValueOnce({ data: { totp: [], all: [] }, error: null });
    mocks.enroll.mockResolvedValueOnce({
      data: {
        id: "factor-clean",
        totp: { qr_code: "data:image/svg+xml;clean", secret: "CLEAN_SECRET", uri: "otpauth://clean" },
      },
      error: null,
    });

    const res = await enrollTotpFactor();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe("factor-clean");
      expect(res.data.totp.secret).toBe("CLEAN_SECRET");
    }
    expect(mocks.listFactors).toHaveBeenCalledTimes(1);
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: "totp" });
  });

  it("successfully removes stale unverified factors before enrollment", async () => {
    // 1. Initial listFactors in prepareTotpEnrollment -> shows stale unverified factor
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-stale-1", status: "unverified", factor_type: "totp" }] },
      error: null,
    });
    // 2. unenroll succeeds
    mocks.unenroll.mockResolvedValueOnce({ data: {}, error: null });
    // 3. Re-fetch factors after cleanup -> empty
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [], all: [] },
      error: null,
    });
    // 4. Enroll succeeds
    mocks.enroll.mockResolvedValueOnce({
      data: {
        id: "factor-new",
        totp: { qr_code: "data:image/svg+xml;new", secret: "NEW_SECRET", uri: "otpauth://new" },
      },
      error: null,
    });

    const res = await enrollTotpFactor();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe("factor-new");
    }
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: "factor-stale-1" });
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: "totp" });
  });

  it("surfaces unenroll failure and prevents enrollment", async () => {
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-stale-2", status: "unverified", factor_type: "totp" }] },
      error: null,
    });
    mocks.unenroll.mockResolvedValueOnce({
      data: null,
      error: { message: "Database connection failed" },
    });

    const res = await enrollTotpFactor();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Failed to remove stale unverified factor (factor-stale-2)");
      expect(res.error).toContain("Database connection failed");
    }
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it("prevents enrollment if a verified authenticator already exists", async () => {
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-verified-existing", status: "verified", factor_type: "totp" }] },
      error: null,
    });

    const res = await enrollTotpFactor();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.alreadyVerified).toBe(true);
      expect(res.error).toContain("already active and verified");
    }
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it("fails with actionable error if stale factor is still present after cleanup", async () => {
    // 1. Initial listFactors
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-stale-stubborn", status: "unverified", factor_type: "totp" }] },
      error: null,
    });
    // 2. unenroll returns ok
    mocks.unenroll.mockResolvedValueOnce({ data: {}, error: null });
    // 3. Re-fetch STILL shows the unverified factor (e.g. replica lag or persistence failure)
    mocks.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-stale-stubborn", status: "unverified", factor_type: "totp" }] },
      error: null,
    });

    const res = await enrollTotpFactor();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("stale unverified authenticator is still present");
    }
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it("cleanupUnverifiedFactors surfaces list failure", async () => {
    mocks.listFactors.mockResolvedValueOnce({
      data: null,
      error: { message: "Network timeout" },
    });

    const res = await cleanupUnverifiedFactors();
    expect(res.success).toBe(false);
    expect(res.error).toContain("Failed to list MFA factors: Network timeout");
    expect(res.removedCount).toBe(0);
  });
});
