// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

// Hoisted mocks so the module factory can access them
const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  listFactors: vi.fn(),
  getUser: vi.fn(),
  fromSelectEq: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/login", navigate],
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
      // eslint-disable-next-line jsx-a11y/anchor-has-content
      <a href={href} {...props}>{children}</a>
    ),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      mfa: { listFactors: mocks.listFactors },
      getUser: mocks.getUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mocks.fromSelectEq,
      })),
    })),
    rpc: mocks.rpc,
  },
}));

import Login from "./Login";

afterEach(() => cleanup());

beforeEach(() => {
  navigate.mockReset();
  mocks.signInWithPassword.mockReset();
  mocks.listFactors.mockReset();
  mocks.getUser.mockReset();
  mocks.fromSelectEq.mockReset();
  mocks.rpc.mockReset();

  // Default: successful sign-in
  mocks.signInWithPassword.mockResolvedValue({ error: null });
});

describe("Login MFA enforcement (T09-04)", () => {
  it("redirects super_admin without a verified TOTP factor to the enroll flow (blocking)", async () => {
    const user = userEvent.setup();

    // No verified factors
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-super-1", app_metadata: { role: "super_admin" }, user_metadata: {} } },
      error: null,
    });
    mocks.fromSelectEq.mockResolvedValue({ data: [{ role: "super_admin" }], error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/mfa/enroll"));
    expect(navigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("also redirects admin without a verified factor to enroll", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-admin-1", app_metadata: {}, user_metadata: { role: "admin" } } },
      error: null,
    });
    mocks.fromSelectEq.mockResolvedValue({ data: [{ role: "admin" }], error: null });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "admin@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/mfa/enroll"));
  });

  it("allows super_admin with a verified TOTP factor to proceed to dashboard", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ status: "verified", factor_type: "totp" }], all: [{ factor_type: "totp", status: "verified" }] },
      error: null,
    });
    // getUser/from/rpc must not be called when factor exists — but mock them anyway
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-super-1", app_metadata: { role: "super_admin" }, user_metadata: {} } }, error: null });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("does NOT block hotel_owner without a factor (opt-in only)", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-owner-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mocks.fromSelectEq.mockResolvedValue({ data: [{ role: "hotel_owner" }], error: null });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    render(<Login />);

    await user.type(screen.getByLabelText(/Email address/), "owner@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(navigate).not.toHaveBeenCalledWith("/mfa/enroll");
  });

  it("falls through to dashboard when MFA check throws", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockRejectedValue(new Error("network down"));
    render(<Login />);
    await user.type(screen.getByLabelText(/Email address/), "super@example.com");
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  });
});
