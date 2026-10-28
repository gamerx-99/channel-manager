// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  useAuthMeQuery: vi.fn(),
  useHotelsQuery: vi.fn(),
  completeMutateAsync: vi.fn(),
  hotelsInvalidate: vi.fn(),
  authMeInvalidate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/dashboard", navigate],
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: { listFactors: mocks.listFactors },
    },
  },
}));

vi.mock("./_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "owner@example.com", name: "Owner" },
    loading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => mocks.useAuthMeQuery(),
      },
    },
    channelManager: {
      hotels: { useQuery: () => mocks.useHotelsQuery() },
      completeHotelOwnerSignup: { useMutation: () => ({ mutateAsync: mocks.completeMutateAsync }) },
    },
    useUtils: () => ({
      channelManager: { hotels: { invalidate: mocks.hotelsInvalidate } },
      auth: { me: { invalidate: mocks.authMeInvalidate } },
    }),
  },
}));

vi.mock("@/lib/routeScope", () => ({
  getRouteScopeDecision: () => ({ allowed: false, reason: "permission_required" as const }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, info: vi.fn(), success: vi.fn() },
}));

import { PrivateRoute } from "./PrivateRoute";

afterEach(() => cleanup());

beforeEach(() => {
  navigate.mockReset();
  mocks.listFactors.mockReset();
  mocks.useAuthMeQuery.mockReset();
  mocks.useHotelsQuery.mockReset();
  mocks.completeMutateAsync.mockReset();
  mocks.hotelsInvalidate.mockReset();
  mocks.authMeInvalidate.mockReset();
  mocks.toastError.mockReset();
  mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
  mocks.useAuthMeQuery.mockReturnValue({ data: { role: "hotel_owner", roles: ["hotel_owner"] }, isLoading: false, isError: false });
  mocks.useHotelsQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
  window.localStorage.clear();
});

describe("PrivateRoute pending signup", () => {
  it("invalidates hotels after the pending token completes", async () => {
    window.localStorage.setItem("hayhost.pendingSignupToken", "tok-1");
    mocks.completeMutateAsync.mockResolvedValue({ success: true });

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(mocks.completeMutateAsync).toHaveBeenCalledWith({ token: "tok-1" }));
    await waitFor(() => expect(mocks.hotelsInvalidate).toHaveBeenCalled());
    expect(mocks.authMeInvalidate).toHaveBeenCalled();
    expect(window.localStorage.getItem("hayhost.pendingSignupToken")).toBeNull();
  });

  it("removes the token and shows an error on an expired-token failure", async () => {
    window.localStorage.setItem("hayhost.pendingSignupToken", "tok-expired");
    mocks.completeMutateAsync.mockRejectedValue({ code: "BAD_REQUEST", message: "expired" });

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(mocks.completeMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(window.localStorage.getItem("hayhost.pendingSignupToken")).toBeNull();
  });

  it("keeps the token on a network error", async () => {
    window.localStorage.setItem("hayhost.pendingSignupToken", "tok-net");
    mocks.completeMutateAsync.mockRejectedValue(new Error("Failed to fetch"));

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(mocks.completeMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(window.localStorage.getItem("hayhost.pendingSignupToken")).toBe("tok-net");
  });
});