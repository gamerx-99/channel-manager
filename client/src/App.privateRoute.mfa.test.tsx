// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  useAuthMeQuery: vi.fn(),
  useHotelsQuery: vi.fn(),
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
    user: { id: "user-1", email: "super@example.com", name: "Super Admin" },
    loading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => mocks.useAuthMeQuery() } },
    channelManager: { hotels: { useQuery: () => mocks.useHotelsQuery() } },
  },
}));

// The route-scope decision (which nav/hotel a role may open) is unrelated to
// the MFA gate under test here. Short-circuit it to "restricted" so a
// non-blocked render stops at PrivateRoute's own restricted-access message
// instead of mounting the full AppShell (NotificationBell, WorkspaceMenu,
// LanguageContext, etc.) that this focused test has no reason to stand up.
vi.mock("./lib/routeScope", () => ({
  getRouteScopeDecision: () => ({ allowed: false, reason: "permission_required" as const }),
}));

import { PrivateRoute } from "./App";

afterEach(() => cleanup());

beforeEach(() => {
  navigate.mockReset();
  mocks.listFactors.mockReset();
  mocks.useAuthMeQuery.mockReset();
  mocks.useHotelsQuery.mockReset();
  mocks.useHotelsQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe("PrivateRoute MFA enforcement (persistent, not just at login)", () => {
  it("redirects an already-open super_admin session without a verified factor to /mfa/enroll", async () => {
    mocks.useAuthMeQuery.mockReturnValue({
      data: { role: "super_admin", roles: ["super_admin"] },
      isLoading: false,
      isError: false,
    });
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/mfa/enroll"));
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("does not redirect a hotel_owner session without a factor (opt-in only)", async () => {
    mocks.useAuthMeQuery.mockReturnValue({
      data: { role: "hotel_owner", roles: ["hotel_owner"] },
      isLoading: false,
      isError: false,
    });
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(screen.getByText(/Access restricted/i)).toBeTruthy());
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("fails open (does not redirect to enroll) when the MFA factor check itself errors", async () => {
    mocks.useAuthMeQuery.mockReturnValue({
      data: { role: "super_admin", roles: ["super_admin"] },
      isLoading: false,
      isError: false,
    });
    mocks.listFactors.mockRejectedValue(new Error("network down"));

    render(
      <PrivateRoute>
        <div data-testid="protected-content">Secret dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => expect(screen.getByText(/Access restricted/i)).toBeTruthy());
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });
});
