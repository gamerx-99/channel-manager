// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  verifyTotp: vi.fn(),
  authMeFetch: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/login", navigate],
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
      <a href={href} {...props}>{children}</a>
    ),
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mocks.signInEmail,
    },
    twoFactor: {
      verifyTotp: mocks.verifyTotp,
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: {
        me: {
          fetch: mocks.authMeFetch,
        },
      },
    }),
  },
}));

import Login from "./Login";

afterEach(() => cleanup());

beforeEach(() => {
  navigate.mockReset();
  mocks.signInEmail.mockReset();
  mocks.verifyTotp.mockReset();
  mocks.authMeFetch.mockReset();

  // Default: successful sign-in
  mocks.signInEmail.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("Login MFA enforcement (T09-04)", () => {
  it("redirects super_admin without a verified TOTP factor to the enroll flow (blocking)", async () => {
    const user = userEvent.setup();

    mocks.authMeFetch.mockResolvedValue({
      id: "user-super-1",
      role: "super_admin",
      roles: ["super_admin"],
      twoFactorEnabled: false,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/mfa/enroll"));
    expect(navigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("also redirects admin without a verified factor to enroll", async () => {
    const user = userEvent.setup();

    mocks.authMeFetch.mockResolvedValue({
      id: "user-admin-1",
      role: "admin",
      roles: ["admin"],
      twoFactorEnabled: false,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "admin@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/mfa/enroll"));
  });

  it("allows super_admin with a verified TOTP factor to proceed to dashboard", async () => {
    const user = userEvent.setup();

    mocks.authMeFetch.mockResolvedValue({
      id: "user-super-1",
      role: "super_admin",
      roles: ["super_admin"],
      twoFactorEnabled: true,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("does NOT block hotel_owner without a factor (opt-in only)", async () => {
    const user = userEvent.setup();

    mocks.authMeFetch.mockResolvedValue({
      id: "user-owner-1",
      role: "hotel_owner",
      roles: ["hotel_owner"],
      twoFactorEnabled: false,
    });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "owner@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("handles 2FA challenge when twoFactorRedirect is returned", async () => {
    const user = userEvent.setup();

    mocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    mocks.verifyTotp.mockResolvedValue({ error: null });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    // Should switch to TOTP challenge view
    await waitFor(() => {
      expect(screen.getByTestId("login-totp-form")).toBeTruthy();
    });

    const totpInput = screen.getByLabelText(/6-digit code/i);
    await user.type(totpInput, "123456");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => {
      expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("falls through to dashboard when MFA check throws", async () => {
    const user = userEvent.setup();
    mocks.authMeFetch.mockRejectedValue(new Error("network down"));

    render(<Login />);
    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  });
});
