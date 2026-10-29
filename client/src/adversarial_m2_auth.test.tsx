// @vitest-environment jsdom
import React from "react";
(globalThis as any).React = React;
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ==========================================
// Hoisted Mocks
// ==========================================
const navigate = vi.fn();

const authClientMocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  signInEmail: vi.fn(),
  verifyTotp: vi.fn(),
}));

const trpcMocks = vi.hoisted(() => ({
  authMeQuery: vi.fn(),
  authMeFetch: vi.fn(),
  hotelsQuery: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/test", navigate],
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
      <a href={href} {...props}>{children}</a>
    ),
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: authClientMocks.useSession,
    signOut: authClientMocks.signOut,
    signIn: {
      email: authClientMocks.signInEmail,
    },
    twoFactor: {
      verifyTotp: authClientMocks.verifyTotp,
    },
  },
  signOut: authClientMocks.signOut,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: {
        me: {
          fetch: trpcMocks.authMeFetch,
        },
      },
    }),
    auth: {
      me: {
        useQuery: () => trpcMocks.authMeQuery(),
      },
    },
    channelManager: {
      hotels: {
        useQuery: () => trpcMocks.hotelsQuery(),
      },
    },
  },
}));

vi.mock("./lib/routeScope", () => ({
  getRouteScopeDecision: () => ({ allowed: true }),
}));

vi.mock("./components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell-mock">{children}</div>
  ),
}));

// Components under test
import {
  signOutCurrentSession,
  signOutCurrentSupabaseSession,
  useAuth,
} from "./_core/hooks/useAuth";
import { PrivateRoute } from "./components/auth/PrivateRoute";
import Login from "./pages/Login";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  navigate.mockReset();
  authClientMocks.useSession.mockReset();
  authClientMocks.signOut.mockReset();
  authClientMocks.signInEmail.mockReset();
  authClientMocks.verifyTotp.mockReset();
  trpcMocks.authMeQuery.mockReset();
  trpcMocks.authMeFetch.mockReset();
  trpcMocks.hotelsQuery.mockReset();

  trpcMocks.hotelsQuery.mockReturnValue({
    data: [{ id: "hotel-1", name: "Grand Resort" }],
    isLoading: false,
    isError: false,
  });
});

// =========================================================================
// Suite 1: useAuth Reactive State, SignOut, and Session Lifecycle
// =========================================================================
describe("Empirical Challenge: useAuth Hook & Reactive Session State", () => {
  it("exposes loading state while session is isPending", () => {
    authClientMocks.useSession.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("synchronizes user profile reactively when session resolves", () => {
    const refetchMock = vi.fn();
    authClientMocks.useSession.mockReturnValue({
      data: {
        user: {
          id: "usr-42",
          email: "guest@example.com",
          name: "Guest User",
          twoFactorEnabled: true,
        },
      },
      isPending: false,
      error: null,
      refetch: refetchMock,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: "usr-42",
      email: "guest@example.com",
      name: "Guest User",
      twoFactorEnabled: true,
    });
  });

  it("falls back user name to email when name is null or undefined", () => {
    authClientMocks.useSession.mockReturnValue({
      data: {
        user: {
          id: "usr-43",
          email: "noname@example.com",
          name: null,
          twoFactorEnabled: false,
        },
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.user?.name).toBe("noname@example.com");
    expect(result.current.user?.twoFactorEnabled).toBe(false);
  });

  it("handles reactive session state transitions from authenticated to unauthenticated (logout/expiry)", () => {
    let currentSessionData: any = {
      user: { id: "usr-99", email: "active@example.com", name: "Active User" },
    };

    authClientMocks.useSession.mockImplementation(() => ({
      data: currentSessionData,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }));

    const { result, rerender } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe("usr-99");

    // Simulate session invalidation / token expiry
    currentSessionData = null;
    rerender();

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("signOutCurrentSession and alias signOutCurrentSupabaseSession revoke session and return clearUser flag", async () => {
    authClientMocks.signOut.mockResolvedValue({ error: null });

    const res1 = await signOutCurrentSession();
    expect(res1).toEqual({ error: null, clearUser: true });

    const res2 = await signOutCurrentSupabaseSession();
    expect(res2).toEqual({ error: null, clearUser: true });

    expect(authClientMocks.signOut).toHaveBeenCalledTimes(2);
  });

  it("signOutCurrentSession captures and wraps failures with clearUser: false", async () => {
    authClientMocks.signOut.mockResolvedValue({
      error: { message: "Failed to reach Better Auth service" },
    });

    const res = await signOutCurrentSession();
    expect(res.clearUser).toBe(false);
    expect(res.error?.message).toContain("Failed to reach Better Auth service");
  });

  it("useAuth.logout() triggers signOutCurrentSession, refetches session, and sets error on failure", async () => {
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    authClientMocks.useSession.mockReturnValue({
      data: { user: { id: "usr-1", email: "a@b.com" } },
      isPending: false,
      error: null,
      refetch: refetchMock,
    });
    authClientMocks.signOut.mockResolvedValue({
      error: new Error("Network timeout during logout"),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(authClientMocks.signOut).toHaveBeenCalled();
    expect(refetchMock).toHaveBeenCalled();
    expect(result.current.error?.message).toContain("Network timeout during logout");
    expect(result.current.loading).toBe(false);
  });

  it("redirects unauthenticated session when redirectOnUnauthenticated is set", () => {
    const originalLocation = window.location;
    const assignMock = vi.fn();
    delete (window as any).location;
    window.location = { ...originalLocation, pathname: "/dashboard", assign: assignMock } as any;

    authClientMocks.useSession.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });

    renderHook(() => useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" }));

    expect(assignMock).toHaveBeenCalledWith("/login");

    (window as any).location = originalLocation;
  });
});

// =========================================================================
// Suite 2: PrivateRoute MFA Enforcement & Role Boundaries
// =========================================================================
describe("Empirical Challenge: PrivateRoute MFA Enforcement", () => {
  beforeEach(() => {
    // By default, authenticated hook state
    authClientMocks.useSession.mockReturnValue({
      data: { user: { id: "admin-1", email: "admin@hayhost.com", name: "Admin" } },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("BLOCKS un-enrolled super_admin: redirects to /mfa/enroll and does NOT leak protected children", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "super_admin", roles: ["super_admin"], twoFactorEnabled: false },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="critical-secret">Super Admin Platform Config</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/mfa/enroll");
    });
    expect(screen.queryByTestId("critical-secret")).toBeNull();
  });

  it("BLOCKS un-enrolled admin (platform role): redirects to /mfa/enroll", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "admin", roles: ["admin"], twoFactorEnabled: false },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="critical-secret">Platform Admin View</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/mfa/enroll");
    });
    expect(screen.queryByTestId("critical-secret")).toBeNull();
  });

  it("BLOCKS un-enrolled support (platform role): redirects to /mfa/enroll", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "support", roles: ["support"], twoFactorEnabled: false },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="critical-secret">Support View</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/mfa/enroll");
    });
    expect(screen.queryByTestId("critical-secret")).toBeNull();
  });

  it("PERMITS enrolled super_admin (twoFactorEnabled: true): does not redirect to /mfa/enroll", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "super_admin", roles: ["super_admin"], twoFactorEnabled: true },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="critical-secret">Super Admin Platform Config</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("critical-secret")).toBeTruthy();
    });
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("PERMITS hotel_owner without MFA: does not redirect to /mfa/enroll", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "hotel_owner", roles: ["hotel_owner"], twoFactorEnabled: false },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="hotel-owner-dashboard">Property Dashboard</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("hotel-owner-dashboard")).toBeTruthy();
    });
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("PERMITS revenue_manager without MFA: does not redirect to /mfa/enroll", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: { role: "revenue_manager", roles: ["revenue_manager"], twoFactorEnabled: false },
      isLoading: false,
      isError: false,
    });

    render(
      <PrivateRoute>
        <div data-testid="pricing-view">Dynamic Pricing Matrix</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pricing-view")).toBeTruthy();
    });
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("blocks rendering with error UI when role query fails", async () => {
    trpcMocks.authMeQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
    });

    render(
      <PrivateRoute>
        <div data-testid="pricing-view">Dynamic Pricing Matrix</div>
      </PrivateRoute>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to verify your property access/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("pricing-view")).toBeNull();
  });
});

// =========================================================================
// Suite 3: Login Page Inline 2FA Challenge Flow & MFA Interception
// =========================================================================
describe("Empirical Challenge: Login Page Inline 2FA Challenge Flow", () => {
  it("when Better Auth signals twoFactorRedirect, does NOT navigate to dashboard, and shows TOTP form", async () => {
    const user = userEvent.setup();

    authClientMocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/i), "admin@hayhost.com");
    await user.type(screen.getByLabelText(/Password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // Must switch to 2FA challenge form and MUST NOT navigate to dashboard
    await waitFor(() => {
      expect(screen.getByTestId("login-totp-form")).toBeTruthy();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("123456")).toBeTruthy();
  });

  it("stays on TOTP form and rejects invalid TOTP code, showing error message", async () => {
    const user = userEvent.setup();

    authClientMocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValue({
      error: { message: "Invalid verification code" },
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/i), "admin@hayhost.com");
    await user.type(screen.getByLabelText(/Password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByTestId("login-totp-form")).toBeTruthy());

    const codeInput = screen.getByPlaceholderText("123456");
    await user.type(codeInput, "999999");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(authClientMocks.verifyTotp).toHaveBeenCalledWith({ code: "999999" });
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("Incorrect code");
    });

    // CRITICAL: Dashboard must NOT be navigated to on failed TOTP!
    expect(navigate).not.toHaveBeenCalled();
  });

  it("allows user to cancel/back from 2FA challenge to password form without navigating", async () => {
    const user = userEvent.setup();

    authClientMocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/i), "admin@hayhost.com");
    await user.type(screen.getByLabelText(/Password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByTestId("login-totp-form")).toBeTruthy());

    // Click "Back to sign in" / "Back"
    await user.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Email address/i)).toBeTruthy();
      expect(screen.queryByTestId("login-totp-form")).toBeNull();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to dashboard only after TOTP code is verified successfully", async () => {
    const user = userEvent.setup();

    authClientMocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    authClientMocks.verifyTotp.mockResolvedValue({
      error: null,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/i), "admin@hayhost.com");
    await user.type(screen.getByLabelText(/Password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByTestId("login-totp-form")).toBeTruthy());

    const codeInput = screen.getByPlaceholderText("123456");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(authClientMocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects un-enrolled super_admin directly to /mfa/enroll after password login", async () => {
    const user = userEvent.setup();

    authClientMocks.signInEmail.mockResolvedValue({
      data: { user: { id: "super-1" } },
      error: null,
    });
    trpcMocks.authMeFetch.mockResolvedValue({
      id: "super-1",
      role: "super_admin",
      roles: ["super_admin"],
      twoFactorEnabled: false,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/i), "super@hayhost.com");
    await user.type(screen.getByLabelText(/Password/i), "super-secret");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/mfa/enroll");
    });
    expect(navigate).not.toHaveBeenCalledWith("/dashboard");
  });
});
