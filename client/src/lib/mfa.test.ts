// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasVerifiedTotpFactor,
  cleanupUnverifiedFactors,
  prepareTotpEnrollment,
  useMfaStepUp,
} from "./mfa";

const authClientMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyTotp: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  status: vi.fn(),
  verify: vi.fn(),
}));

// The hook now asks the server (auth.mfaStepUpStatus / auth.verifyMfaStepUp)
// instead of Better Auth's client, because only the server can record a step-up
// that requireRecentMfaVerification accepts.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        auth: {
          mfaStepUpStatus: { query: serverMocks.status },
          verifyMfaStepUp: { mutate: serverMocks.verify },
        },
      },
    }),
  },
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
  serverMocks.status.mockReset();
  serverMocks.verify.mockReset();
});

describe("mfa pure helpers", () => {
  it("detects verified totp factors", () => {
    expect(hasVerifiedTotpFactor(null)).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [], all: [] })).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [{ status: "unverified" }] })).toBe(false);
    expect(hasVerifiedTotpFactor({ totp: [{ status: "verified" }] })).toBe(true);
    expect(hasVerifiedTotpFactor({ all: [{ factor_type: "totp", status: "verified" }] })).toBe(true);
    expect(hasVerifiedTotpFactor({ all: [{ factor_type: "phone", status: "verified" }] })).toBe(false);
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

describe("useMfaStepUp Hook (server-backed step-up)", () => {
  async function trigger(result: { current: ReturnType<typeof useMfaStepUp> }) {
    let step = "";
    await act(async () => { step = await result.current.triggerStepUp(); });
    return step;
  }

  it("initializes with idle state", () => {
    const { result } = renderHook(() => useMfaStepUp());
    expect(result.current.mfaState).toEqual({ status: "idle" });
  });

  it("returns error when the server cannot identify the user", async () => {
    serverMocks.status.mockRejectedValueOnce(new Error("Please login (10001)"));
    const { result } = renderHook(() => useMfaStepUp());

    expect(await trigger(result)).toBe("error");
    expect(result.current.mfaState).toEqual({ status: "error", message: "Please login (10001)" });
  });

  it("lets an account without 2FA through, because 2FA is optional", async () => {
    serverMocks.status.mockResolvedValueOnce({ status: "needs_enroll", expiresAtMs: null });
    const { result } = renderHook(() => useMfaStepUp());

    expect(await trigger(result)).toBe("verified");
    expect(result.current.mfaState).toEqual({ status: "verified" });
  });

  it("returns needs_challenge when the session has no recent step-up", async () => {
    serverMocks.status.mockResolvedValueOnce({ status: "needs_challenge", expiresAtMs: null });
    const { result } = renderHook(() => useMfaStepUp());

    expect(await trigger(result)).toBe("needs_challenge");
    expect(result.current.mfaState.status).toBe("needs_challenge");
  });

  it("returns verified when the server already holds a fresh step-up", async () => {
    serverMocks.status.mockResolvedValueOnce({ status: "verified", expiresAtMs: Date.now() + 60_000 });
    const { result } = renderHook(() => useMfaStepUp());

    expect(await trigger(result)).toBe("verified");
    expect(result.current.mfaState).toEqual({ status: "verified" });
  });

  it("verifies the code on the server and becomes verified", async () => {
    serverMocks.verify.mockResolvedValueOnce({ verified: true });
    const { result } = renderHook(() => useMfaStepUp());

    let ok = false;
    await act(async () => { ok = await result.current.submitTotp("123456"); });

    expect(ok).toBe(true);
    expect(serverMocks.verify).toHaveBeenCalledWith({ code: "123456" });
    expect(authClientMocks.verifyTotp).not.toHaveBeenCalled();
    expect(result.current.mfaState).toEqual({ status: "verified" });
  });

  it("shows the server message when the code is wrong", async () => {
    serverMocks.verify.mockRejectedValueOnce(new Error("Incorrect code. Wait for the next 6-digit code and try again."));
    const { result } = renderHook(() => useMfaStepUp());

    let ok = true;
    await act(async () => { ok = await result.current.submitTotp("999999"); });

    expect(ok).toBe(false);
    expect(result.current.mfaState).toMatchObject({ status: "needs_challenge", error: expect.stringContaining("Incorrect code") });
  });

  it("refuses a code that is not six digits without calling the server", async () => {
    const { result } = renderHook(() => useMfaStepUp());

    let ok = true;
    await act(async () => { ok = await result.current.submitTotp("12a456"); });

    expect(ok).toBe(false);
    expect(serverMocks.verify).not.toHaveBeenCalled();
  });

  it("resets to idle", async () => {
    serverMocks.verify.mockResolvedValueOnce({ verified: true });
    const { result } = renderHook(() => useMfaStepUp());
    await act(async () => { await result.current.submitTotp("123456"); });

    act(() => { result.current.reset(); });
    expect(result.current.mfaState).toEqual({ status: "idle" });
  });
});
