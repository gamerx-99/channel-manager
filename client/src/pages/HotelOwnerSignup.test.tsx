// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const mocks = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  validateQuery: vi.fn(),
  completeMutation: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/signup/mock-token", navigate],
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: mocks.signUpEmail,
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    channelManager: {
      validateSignupLink: {
        useQuery: (input: { token: string }) => mocks.validateQuery(input),
      },
      completeHotelOwnerSignup: {
        useMutation: () => ({
          mutateAsync: mocks.completeMutation,
        }),
      },
    },
  },
}));

import HotelOwnerSignup from "./HotelOwnerSignup";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  navigate.mockReset();
  mocks.signUpEmail.mockReset();
  mocks.validateQuery.mockReset();
  mocks.completeMutation.mockReset();
});

describe("HotelOwnerSignup Component Empirical Verification", () => {
  it("displays loading state while validating signup link", async () => {
    mocks.validateQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    });

    render(<HotelOwnerSignup token="test-token" />);

    expect(screen.getByText("Checking your signup link…")).toBeTruthy();
  });

  it("displays error PageState when signup link is invalid or expired", async () => {
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: false },
    });

    render(<HotelOwnerSignup token="invalid-token" />);

    expect(screen.getByText("This signup link is no longer valid")).toBeTruthy();
    expect(screen.getByText(/It may have expired or already been used/i)).toBeTruthy();
  });

  it("renders signup form with hotel name and security string contract", async () => {
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: true, hotelName: "Grand Palace Hotel" },
    });

    render(<HotelOwnerSignup token="valid-token" />);

    expect(screen.getByText("Grand Palace Hotel.")).toBeTruthy();
    expect(screen.getByText("Your hotel data is scoped by hayhost scoped authorization.")).toBeTruthy();
    expect(screen.getByLabelText(/^Email address$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Confirm password$/i)).toBeTruthy();
  });

  it("validates password length and password match client-side before submission", async () => {
    const user = userEvent.setup();
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: true, hotelName: "Grand Palace Hotel" },
    });

    render(<HotelOwnerSignup token="valid-token" />);

    // Password too short (< 8 chars)
    await user.type(screen.getByLabelText(/^Email address$/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "short");
    await user.type(screen.getByLabelText(/^Confirm password$/i), "short");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(screen.getByRole("alert").textContent).toBe("Choose a password with at least 8 characters.");
    expect(mocks.signUpEmail).not.toHaveBeenCalled();

    // Password mismatch
    await user.clear(screen.getByLabelText(/^Password$/i));
    await user.clear(screen.getByLabelText(/^Confirm password$/i));
    await user.type(screen.getByLabelText(/^Password$/i), "password123");
    await user.type(screen.getByLabelText(/^Confirm password$/i), "different123");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("completes Better Auth signup, completes hotel owner link mutation, and navigates to /dashboard", async () => {
    const user = userEvent.setup();
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: true, hotelName: "Grand Palace Hotel" },
    });
    mocks.signUpEmail.mockResolvedValue({
      data: { user: { id: "user-999", email: "owner@example.com" } },
      error: null,
    });
    mocks.completeMutation.mockResolvedValue({ success: true, hotelId: "hotel-1" });

    render(<HotelOwnerSignup token="valid-token" />);

    await user.type(screen.getByLabelText(/^Email address$/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret12345");
    await user.type(screen.getByLabelText(/^Confirm password$/i), "secret12345");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(mocks.signUpEmail).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "secret12345",
        name: "owner",
      });
      expect(mocks.completeMutation).toHaveBeenCalledWith({ token: "valid-token" });
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("handles Better Auth signup failure gracefully and shows error", async () => {
    const user = userEvent.setup();
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: true, hotelName: "Grand Palace Hotel" },
    });
    mocks.signUpEmail.mockResolvedValue({
      data: null,
      error: { message: "Email already registered in system." },
    });

    render(<HotelOwnerSignup token="valid-token" />);

    await user.type(screen.getByLabelText(/^Email address$/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret12345");
    await user.type(screen.getByLabelText(/^Confirm password$/i), "secret12345");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Email already registered in system.");
      expect(mocks.completeMutation).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("handles completeSignup mutation failure gracefully and shows error", async () => {
    const user = userEvent.setup();
    mocks.validateQuery.mockReturnValue({
      isLoading: false,
      data: { valid: true, hotelName: "Grand Palace Hotel" },
    });
    mocks.signUpEmail.mockResolvedValue({
      data: { user: { id: "user-999", email: "owner@example.com" } },
      error: null,
    });
    mocks.completeMutation.mockRejectedValue(new Error("Database transaction aborted."));

    render(<HotelOwnerSignup token="valid-token" />);

    await user.type(screen.getByLabelText(/^Email address$/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret12345");
    await user.type(screen.getByLabelText(/^Confirm password$/i), "secret12345");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Database transaction aborted.");
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
