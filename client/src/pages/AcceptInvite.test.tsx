// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/accept-invite", navigate],
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mocks.signInEmail,
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    staff: {
      acceptStaffInvite: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
        }),
      },
    },
    channelManager: {
      acceptStaffInvite: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
        }),
      },
    },
  },
}));

import AcceptInvite from "./AcceptInvite";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/accept-invite");
});

beforeEach(() => {
  navigate.mockReset();
  mocks.mutateAsync.mockReset();
  mocks.signInEmail.mockReset();
});

describe("AcceptInvite component", () => {
  it("renders set-password form when invite token is present in URL", async () => {
    window.history.pushState({}, "", "/accept-invite?token=valid-token&email=staff@example.com");

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Confirm new password$/i)).toBeTruthy();
    });
  });

  it("validates password length and match before calling acceptStaffInvite", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/accept-invite?token=valid-token&email=staff@example.com");

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
    });

    // Too short (< 8 chars)
    await user.type(screen.getByLabelText(/^New password$/i), "short");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "short");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    // Mismatch
    await user.clear(screen.getByLabelText(/^New password$/i));
    await user.clear(screen.getByLabelText(/^Confirm new password$/i));
    await user.type(screen.getByLabelText(/^New password$/i), "password123");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "different123");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match");
  });

  it("updates password, signs in, and navigates to dashboard on valid submission", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/accept-invite?token=valid-token&email=staff@example.com");

    mocks.mutateAsync.mockResolvedValue({
      success: true,
      user: { id: "user-123", email: "staff@example.com" },
    });
    mocks.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^New password$/i)).toBeTruthy();
    });

    await user.type(screen.getByLabelText(/^New password$/i), "secret12345");
    await user.type(screen.getByLabelText(/^Confirm new password$/i), "secret12345");
    await user.click(screen.getByRole("button", { name: /Set password/i }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        token: "valid-token",
        password: "secret12345",
      });
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "staff@example.com",
        password: "secret12345",
      });
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("displays error state when token is missing from URL", async () => {
    window.history.pushState({}, "", "/accept-invite");

    render(<AcceptInvite />);

    await waitFor(() => {
      expect(screen.getByText(/Invitation link is invalid or expired/i)).toBeTruthy();
    });
  });
});
