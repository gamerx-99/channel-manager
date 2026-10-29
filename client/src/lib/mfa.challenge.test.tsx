// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMfaStepUp, MFA_STEP_UP_WINDOW_MS } from "./mfa";
import { supabase } from "@/lib/supabase";

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

// Mock tRPC for SlipOkSettings component tests
const trpcMocks = vi.hoisted(() => {
  const getSettingsUseQuery = vi.fn();
  const saveKeyUseMutation = vi.fn();
  const removeKeyUseMutation = vi.fn();
  return { getSettingsUseQuery, saveKeyUseMutation, removeKeyUseMutation };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    slipok: {
      getSettings: {
        useQuery: trpcMocks.getSettingsUseQuery,
      },
      saveKey: {
        useMutation: trpcMocks.saveKeyUseMutation,
      },
      removeKey: {
        useMutation: trpcMocks.removeKeyUseMutation,
      },
    },
  },
}));

import SlipOkSettings from "@/components/SlipOkSettings";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  authClientMocks.getSession.mockReset();
  authClientMocks.verifyTotp.mockReset();
  trpcMocks.getSettingsUseQuery.mockReset().mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  trpcMocks.saveKeyUseMutation.mockReset().mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
  trpcMocks.removeKeyUseMutation.mockReset().mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

describe("Empirical Challenge: Zero Supabase Runtime Dependency", () => {
  it("verifies supabase export is null in current environment without crashing", () => {
    // When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are unset, supabase is null
    expect(supabase).toBeNull();
  });

  it("renders SlipOkSettings with zero errors when supabase is null", () => {
    // Opening SlipOkSettings must never crash due to null supabase
    expect(() => {
      render(<SlipOkSettings hotelId="hotel-test-1" />);
    }).not.toThrow();

    expect(screen.getByText("Payment Integration")).toBeDefined();
    expect(screen.getByText("SlipOK Settings")).toBeDefined();
    expect(screen.getByRole("button", { name: /Unlock settings/i })).toBeDefined();
  });
});

describe("Empirical Challenge: Step-Up State Machine Transitions & Expirations", () => {
  it("strictly challenges expired verification (>10m window) via twoFactorVerifiedAt", async () => {
    // Exactly 10 minutes and 1 millisecond ago
    const expiredTimestamp = new Date(Date.now() - (MFA_STEP_UP_WINDOW_MS + 1000)).toISOString();
    authClientMocks.getSession.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", twoFactorEnabled: true },
        session: { id: "s-1", twoFactorVerifiedAt: expiredTimestamp },
      },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());
    let step = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    // Must NOT bypass — must demand challenge because window expired
    expect(step).toBe("needs_challenge");
    expect(result.current.mfaState.status).toBe("needs_challenge");
  });

  it("accurately verifies freshness boundary at 9m 59s (<10m window)", async () => {
    // 9 minutes and 59 seconds ago (within window)
    const freshTimestamp = new Date(Date.now() - (MFA_STEP_UP_WINDOW_MS - 1000)).toISOString();
    authClientMocks.getSession.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", twoFactorEnabled: true },
        session: { id: "s-1", twoFactorVerifiedAt: freshTimestamp },
      },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());
    let step = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("verified");
    expect(result.current.mfaState.status).toBe("verified");
  });

  it("handles malformed or invalid twoFactorVerifiedAt strings safely", async () => {
    const invalidTimestamps = ["invalid-date", "", "NaN", "undefined", "1970-01-01T00:00:00.000Z"];

    for (const ts of invalidTimestamps) {
      authClientMocks.getSession.mockResolvedValueOnce({
        data: {
          user: { id: "u-1", twoFactorEnabled: true },
          session: { id: "s-1", twoFactorVerifiedAt: ts },
        },
        error: null,
      });

      const { result } = renderHook(() => useMfaStepUp());
      let step = "";
      await act(async () => {
        step = await result.current.triggerStepUp();
      });

      // Must safely reject malformed dates and require fresh challenge
      expect(step).toBe("needs_challenge");
      expect(result.current.mfaState.status).toBe("needs_challenge");
    }
  });

  it("evaluates session createdAt fallback when twoFactorVerified is true", async () => {
    // Within window
    const freshCreatedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    authClientMocks.getSession.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", twoFactorEnabled: true },
        session: { id: "s-1", twoFactorVerified: true, createdAt: freshCreatedAt },
      },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());
    let step = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });
    expect(step).toBe("verified");

    // Outside window (>10m)
    const expiredCreatedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    authClientMocks.getSession.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", twoFactorEnabled: true },
        session: { id: "s-2", twoFactorVerified: true, createdAt: expiredCreatedAt },
      },
      error: null,
    });

    const { result: result2 } = renderHook(() => useMfaStepUp());
    let step2 = "";
    await act(async () => {
      step2 = await result2.current.triggerStepUp();
    });
    expect(step2).toBe("needs_challenge");
  });

  it("invalidates local verification when fake timer advances beyond 10m window", async () => {
    vi.useFakeTimers();
    const baseTime = 1_700_000_000_000;
    vi.setSystemTime(baseTime);

    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-1", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    // 1. Initial trigger -> needs_challenge
    await act(async () => {
      await result.current.triggerStepUp();
    });
    expect(result.current.mfaState.status).toBe("needs_challenge");

    // 2. Submit valid TOTP -> verified
    await act(async () => {
      await result.current.submitTotp("123456");
    });
    expect(result.current.mfaState.status).toBe("verified");

    // 3. Trigger step up at +5 minutes -> still verified
    vi.setSystemTime(baseTime + 5 * 60 * 1000);
    let stepAt5m = "";
    await act(async () => {
      stepAt5m = await result.current.triggerStepUp();
    });
    expect(stepAt5m).toBe("verified");

    // 4. Advance time past 10 minutes (+10m 1s)
    vi.setSystemTime(baseTime + 10 * 60 * 1000 + 1000);
    let stepAt10m = "";
    await act(async () => {
      stepAt10m = await result.current.triggerStepUp();
    });

    // Local timestamp has expired! Must re-challenge
    expect(stepAt10m).toBe("needs_challenge");
    expect(result.current.mfaState.status).toBe("needs_challenge");
  });
});

describe("Empirical Challenge: Hostile Inputs and Error Handling", () => {
  it("rejects invalid code lengths without making network calls", async () => {
    const { result } = renderHook(() => useMfaStepUp());

    const badCodes = ["", "1", "12", "123", "1234", "12345", "1234567", "abcdefg", "      "];
    for (const code of badCodes) {
      let ok: boolean = true;
      await act(async () => {
        ok = await result.current.submitTotp(code);
      });
      expect(ok).toBe(false);
      expect(result.current.mfaState.status).toBe("needs_challenge");
      if (result.current.mfaState.status === "needs_challenge") {
        expect(result.current.mfaState.error).toBe("Please enter a valid 6-digit authenticator code.");
      }
      expect(authClientMocks.verifyTotp).not.toHaveBeenCalled();
    }
  });

  it("trims whitespace from 6-digit codes correctly", async () => {
    authClientMocks.verifyTotp.mockResolvedValueOnce({
      data: { user: { id: "u-1" } },
      error: null,
    });

    const { result } = renderHook(() => useMfaStepUp());

    let ok = false;
    await act(async () => {
      ok = await result.current.submitTotp("  654321  ");
    });

    expect(ok).toBe(true);
    expect(authClientMocks.verifyTotp).toHaveBeenCalledWith({ code: "654321" });
    expect(result.current.mfaState.status).toBe("verified");
  });

  it("catches verifyTotp network exceptions without crashing", async () => {
    authClientMocks.verifyTotp.mockRejectedValueOnce(new Error("Connection refused (ECONNREFUSED)"));

    const { result } = renderHook(() => useMfaStepUp());

    let ok = true;
    await act(async () => {
      ok = await result.current.submitTotp("123456");
    });

    expect(ok).toBe(false);
    expect(result.current.mfaState.status).toBe("needs_challenge");
    if (result.current.mfaState.status === "needs_challenge") {
      expect(result.current.mfaState.error).toBe("Connection refused (ECONNREFUSED)");
    }
  });

  it("catches getSession network exceptions without crashing", async () => {
    authClientMocks.getSession.mockRejectedValueOnce(new Error("Network timeout"));

    const { result } = renderHook(() => useMfaStepUp());

    let step = "";
    await act(async () => {
      step = await result.current.triggerStepUp();
    });

    expect(step).toBe("error");
    expect(result.current.mfaState.status).toBe("error");
    if (result.current.mfaState.status === "error") {
      expect(result.current.mfaState.message).toBe("Network timeout");
    }
  });
});

describe("Empirical Challenge: SlipOkSettings Component End-to-End Flow", () => {
  it("exercises full unlock, invalid code rejection, and cancel reset in SlipOkSettings", async () => {
    const user = userEvent.setup();

    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-1", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });

    // 1. Initial render shows unlock button
    render(<SlipOkSettings hotelId="hotel-1" />);
    const unlockBtn = screen.getByRole("button", { name: /Unlock settings/i });

    // 2. Click unlock -> moves to needs_challenge
    await user.click(unlockBtn);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("000000")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("000000");
    const verifyBtn = screen.getByRole("button", { name: /^Verify$/i });

    // Verify button is disabled when <6 digits
    expect((verifyBtn as HTMLButtonElement).disabled).toBe(true);

    // 3. Type 6 digits of wrong code
    await user.type(input, "000000");
    expect((verifyBtn as HTMLButtonElement).disabled).toBe(false);

    authClientMocks.verifyTotp.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid code" },
    });

    await user.click(verifyBtn);

    // 4. Error message appears inline in red
    await waitFor(() => {
      expect(screen.getByText(/Incorrect code/i)).toBeDefined();
    });

    // 5. Click Cancel -> returns to idle prompt
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Unlock settings/i })).toBeDefined();
    });
  });

  it("handles successful verification and exposes settings query", async () => {
    const user = userEvent.setup();

    authClientMocks.getSession.mockResolvedValue({
      data: { user: { id: "u-1", twoFactorEnabled: true }, session: { id: "s-1" } },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValueOnce({
      data: { user: { id: "u-1" } },
      error: null,
    });

    trpcMocks.getSettingsUseQuery.mockReturnValue({
      data: { configured: true, branchId: "BR-999" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SlipOkSettings hotelId="hotel-1" />);
    await user.click(screen.getByRole("button", { name: /Unlock settings/i }));

    const input = await screen.findByPlaceholderText("000000");
    await user.type(input, "123456");

    await user.click(screen.getByRole("button", { name: /^Verify$/i }));

    // Unlocks settings and renders Branch ID
    await waitFor(() => {
      expect(screen.getByText("BR-999")).toBeDefined();
      expect(screen.getByText("SlipOK Credential")).toBeDefined();
    });
  });
});
