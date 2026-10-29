// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasVerifiedTotpFactor,
  MFA_ENROLL_PATH,
  shouldEnforceMfaForRoles,
  shouldRedirectToMfaEnroll,
  cleanupUnverifiedFactors,
  prepareTotpEnrollment,
  useMfaStepUp,
} from "./mfa";

const authClientMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: authClientMocks.getSession,
    twoFactor: {
      verifyTotp: authClientMocks.verifyTotp,
    },
  },
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authClientMocks.getSession.mockReset();
  authClientMocks.verifyTotp.mockReset();
});

describe("mfa pure helpers", () => {
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
    expect(shouldRedirectToMfaEnroll(["super_admin"], false)).toBe(true);
    expect(shouldRedirectToMfaEnroll(["super_admin"], true)).toBe(false);
  });

  it("cleanupUnverifiedFactors safely returns success in Better Auth runtime", async () => {
    const res = await cleanupUnverifiedFactors();
    expect(res.success).toBe(true);
    expect(res.removedCount).toBe(0);
  });

  it("prepareTotpEnrollment checks existing 2FA enablement", async () => {
    authClientMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: "u-1", twoFactorEnabled: true }, session: {} },
      error: null,
    });
    const res = await prepareTotpEnrollment();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.alreadyVerified).toBe(true);
    }

    authClientMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: "u-2", twoFactorEnabled: false }, session: {} },
      error: null,
    });
    const res2 = await prepareTotpEnrollment();
    expect(res2.ok).toBe(true);
  });
});

describe("useMfaStepUp Hook with Better Auth", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => useMfaStepUp());
    expect(result.current.mfaState).toEqual({ status: "idle" });
  });

  it("returns error when user is unauthenticated", async () => {
    authClientMocks.getSession.mockResolvedValueOnce({
      data: null,
      error: { message: "No active session" },
    });

    const { result } = renderHook(() => useMfaStepUp());

    let step: string = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("error");
    expect(result.current.mfaState.status).toBe("error");
    if (result.current.mfaState.status === "error") {
      expect(result.current.mfaState.message).toContain("No active session");
    }
  });

  it("returns needs_enroll when user has not enabled 2FA", async () => {
    authClientMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: "u-no-mfa", twoFactorEnabled: false }, session: { id: "s-1" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    let step: string = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("needs_enroll");
    expect(result.current.mfaState).toEqual({ status: "needs_enroll" });
  });

  it("returns needs_challenge when user has 2FA enabled but unverified session", async () => {
    authClientMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: "u-mfa", twoFactorEnabled: true }, session: { id: "s-unverified" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    let step: string = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("needs_challenge");
    expect(result.current.mfaState.status).toBe("needs_challenge");
  });

  it("returns verified directly if session already has fresh twoFactorVerifiedAt", async () => {
    authClientMocks.getSession.mockResolvedValueOnce({
      data: {
        user: { id: "u-mfa", twoFactorEnabled: true },
        session: {
          id: "s-fresh",
          twoFactorVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    let step: string = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("verified");
    expect(result.current.mfaState).toEqual({ status: "verified" });
  });

  it("submits TOTP code and updates state to verified upon success", async () => {
    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-mfa", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValueOnce({
      data: { user: { id: "u-mfa" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    await act(async () => {
      await result.current.triggerStepUp();
    });
    expect(result.current.mfaState.status).toBe("needs_challenge");

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.submitTotp("123456");
    });

    expect(ok).toBe(true);
    expect(authClientMocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    expect(result.current.mfaState).toEqual({ status: "verified" });

    // Subsequent triggerStepUp within freshness window immediately returns verified
    let secondStep: string = "";
    await act(async () => {
      secondStep = await result.current.triggerStepUp();
    });
    expect(secondStep).toBe("verified");
  });

  it("handles invalid TOTP submission gracefully", async () => {
    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-mfa", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid verification code" },
    });

    const { result } = renderHook(() => useMfaStepUp());

    await act(async () => {
      await result.current.triggerStepUp();
    });

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.submitTotp("999999");
    });

    expect(ok).toBe(false);
    expect(result.current.mfaState.status).toBe("needs_challenge");
    if (result.current.mfaState.status === "needs_challenge") {
      expect(result.current.mfaState.error).toContain("Incorrect code");
    }
  });

  it("resets state and clears verification timestamp upon reset()", async () => {
    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-mfa", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValue({
      data: { user: { id: "u-mfa" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    await act(async () => {
      await result.current.triggerStepUp();
      await result.current.submitTotp("123456");
    });
    expect(result.current.mfaState.status).toBe("verified");

    act(() => {
      result.current.reset();
    });
    expect(result.current.mfaState).toEqual({ status: "idle" });

    // After reset, triggerStepUp requires challenge again
    let stepAfterReset: string = "";
    await act(async () => {
      stepAfterReset = await result.current.triggerStepUp();
    });
    expect(stepAfterReset).toBe("needs_challenge");
  });
});
