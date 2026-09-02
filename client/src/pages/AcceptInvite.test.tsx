// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/accept-invite", navigate],
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
    },
  },
}));

import AcceptInvite from "./AcceptInvite";

afterEach(() => cleanup());

beforeEach(() => {
  navigate.mockReset();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.updateUser.mockReset();

  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("AcceptInvite component", () => {
  it("renders set-password form when user session is detected", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "staff@example.com" } } },
      error: null,
    });

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Confirm new password$/i)).toBeTruthy();
    });
  });

  it("validates password length and match before calling updateUser", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "staff@example.com" } } },
      error: null,
    });

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
    });

    // Too short (< 8 chars)
    await user.type(screen.getByLabelText(/^New password$/i), "short");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "short");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    expect(mocks.updateUser).not.toHaveBeenCalled();

    // Mismatch
    await user.clear(screen.getByLabelText(/^New password$/i));
    await user.clear(screen.getByLabelText(/^Confirm new password$/i));
    await user.type(screen.getByLabelText(/^New password$/i), "password123");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "different123");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match");
  });

  it("updates password and navigates to dashboard on valid submission", async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "staff@example.com" } } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
    });

    await user.type(screen.getByLabelText(/^New password$/i), "secret12345");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "secret12345");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({ password: "secret12345" });
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });
});
