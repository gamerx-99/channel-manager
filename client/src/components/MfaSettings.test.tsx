// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const enable = vi.fn();
  const verifyTotp = vi.fn();
  const disable = vi.fn();
  const authMeQuery = vi.fn();
  const invalidate = vi.fn();
  return { enable, verifyTotp, disable, authMeQuery, invalidate };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      enable: mocks.enable,
      verifyTotp: mocks.verifyTotp,
      disable: mocks.disable,
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: {
        me: {
          invalidate: mocks.invalidate,
        },
      },
    }),
    auth: {
      me: {
        useQuery: mocks.authMeQuery,
      },
    },
  },
}));

import MfaSettings from "./MfaSettings";

afterEach(() => cleanup());

beforeEach(() => {
  mocks.enable.mockReset().mockResolvedValue({
    data: {
      method: "totp",
      totpURI: "otpauth://totp/hayhost:test?secret=SECRET123&issuer=hayhost",
      backupCodes: [],
    },
    error: null,
  });
  mocks.verifyTotp.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.disable.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.authMeQuery.mockReset().mockReturnValue({
    data: { twoFactorEnabled: false },
    isLoading: false,
    error: null,
  });
});

describe("MfaSettings", () => {
  it("renders not-enabled state and enroll affordance for all roles", async () => {
    render(<MfaSettings />);
    expect(await screen.findByText("Two-factor authentication")).toBeTruthy();
    expect(screen.getByText("Not enabled")).toBeTruthy();
    expect(screen.getByTestId("mfa-not-enrolled")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enroll authenticator" })).toBeTruthy();
    expect(screen.getByText(/Works for every role/)).toBeTruthy();
  });

  it("enrolls TOTP and shows QR, secret and verification input", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("password123");

    render(<MfaSettings />);

    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    expect(mocks.enable).toHaveBeenCalledWith({ password: "password123" });

    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());
    expect(screen.getByTestId("mfa-qr").getAttribute("src")).toContain("data:image");
    expect(screen.getByTestId("mfa-secret").textContent).toBe("SECRET123");
    expect(screen.getByLabelText("Verification code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify and activate" })).toBeTruthy();

    (window.prompt as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
  });

  it("verifies enrollment via verifyTotp and refreshes factors", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("password123");

    render(<MfaSettings />);

    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and activate" }));

    await waitFor(() => expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" }));
    expect(mocks.invalidate).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Authenticator enrolled and verified")).toBeTruthy());

    (window.prompt as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
  });

  it("supports verify for an existing verified factor (step-up)", async () => {
    const user = userEvent.setup();
    mocks.authMeQuery.mockReturnValue({
      data: { twoFactorEnabled: true },
      isLoading: false,
      error: null,
    });

    render(<MfaSettings />);
    expect(await screen.findByText("Enabled")).toBeTruthy();
    expect(screen.getByTestId("mfa-verified")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Verify with code" }));
    await waitFor(() => expect(screen.getByTestId("mfa-verify-panel")).toBeTruthy());

    await user.type(screen.getByLabelText("Verification code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "654321" });
    await waitFor(() => expect(screen.getByText("Code verified successfully")).toBeTruthy());
  });

  it("unenrolls a verified factor after confirmation", async () => {
    const user = userEvent.setup();
    mocks.authMeQuery.mockReturnValue({
      data: { twoFactorEnabled: true },
      isLoading: false,
      error: null,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("password123");

    render(<MfaSettings />);
    await user.click(screen.getByRole("button", { name: "Remove authenticator" }));

    expect(mocks.disable).toHaveBeenCalledWith({ password: "password123" });
    await waitFor(() => expect(screen.getByText("Authenticator removed")).toBeTruthy());
    expect(mocks.invalidate).toHaveBeenCalled();

    (window.confirm as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
    (window.prompt as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
  });

  it("surfaces enroll and verify errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("password123");

    render(<MfaSettings />);

    mocks.enable.mockResolvedValueOnce({ data: null, error: { message: "Enroll failed" } });
    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Enroll failed");

    // recover enroll for next part
    mocks.enable.mockResolvedValueOnce({
      data: { method: "totp", totpURI: "otpauth://totp/hayhost:test?secret=S&issuer=hayhost", backupCodes: [] },
      error: null,
    });
    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());

    await user.type(screen.getByLabelText("Verification code"), "000000");
    mocks.verifyTotp.mockResolvedValueOnce({ data: null, error: { message: "Invalid code" } });
    await user.click(screen.getByRole("button", { name: "Verify and activate" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Incorrect code"));

    (window.prompt as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
  });

  it("shows error state when auth query fails", async () => {
    mocks.authMeQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Network error"),
    });

    render(<MfaSettings />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Network error");
  });
});
