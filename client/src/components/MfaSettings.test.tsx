// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MfaSettings from "./MfaSettings";

const mocks = vi.hoisted(() => {
  const listFactors = vi.fn(async () => ({
    data: { totp: [] as Array<{ id: string; status: string; factor_type: string }>, all: [] },
    error: null,
  }));
  const enroll = vi.fn(async () => ({
    data: {
      id: "factor-new",
      totp: { qr_code: "data:image/svg+xml;utf-8,<svg>qr</svg>", secret: "SECRET123", uri: "otpauth://totp/test" },
    },
    error: null,
  }));
  const challenge = vi.fn(async () => ({ data: { id: "challenge-1" }, error: null }));
  const verify = vi.fn(async () => ({ data: {}, error: null }));
  const unenroll = vi.fn(async () => ({ data: { id: "factor-1" }, error: null }));
  return { listFactors, enroll, challenge, verify, unenroll };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        challenge: mocks.challenge,
        verify: mocks.verify,
        unenroll: mocks.unenroll,
      },
    },
  },
}));

afterEach(() => cleanup());

beforeEach(() => {
  mocks.listFactors.mockReset().mockResolvedValue({ data: { totp: [], all: [] }, error: null } as never);
  mocks.enroll.mockReset().mockResolvedValue({
    data: {
      id: "factor-new",
      totp: { qr_code: "data:image/svg+xml;utf-8,<svg>qr</svg>", secret: "SECRET123", uri: "otpauth://totp/test" },
    },
    error: null,
  } as never);
  mocks.challenge.mockReset().mockResolvedValue({ data: { id: "challenge-1" }, error: null } as never);
  mocks.verify.mockReset().mockResolvedValue({ data: {}, error: null } as never);
  mocks.unenroll.mockReset().mockResolvedValue({ data: { id: "factor-1" }, error: null } as never);
});

describe("MfaSettings", () => {
  it("renders not-enabled state and enroll affordance for all roles", async () => {
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());
    expect(await screen.findByText("Two-factor authentication")).toBeTruthy();
    expect(screen.getByText("Not enabled")).toBeTruthy();
    expect(screen.getByTestId("mfa-not-enrolled")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enroll authenticator" })).toBeTruthy();
    expect(screen.getByText(/Works for every role/)).toBeTruthy();
  });

  it("enrolls TOTP and shows QR, secret and verification input", async () => {
    const user = userEvent.setup();
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    expect(mocks.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: expect.stringMatching(/^Authenticator-/),
    });

    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());
    expect(screen.getByTestId("mfa-qr").getAttribute("src")).toContain("data:image");
    expect(screen.getByTestId("mfa-secret").textContent).toBe("SECRET123");
    expect(screen.getByLabelText("Verification code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify and activate" })).toBeTruthy();
  });

  it("verifies enrollment via challenge + verify and refreshes factors", async () => {
    const user = userEvent.setup();
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and activate" }));

    await waitFor(() => expect(mocks.challenge).toHaveBeenCalledWith({ factorId: "factor-new" }));
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "factor-new", challengeId: "challenge-1", code: "123456" });
    // Mount (1) + pre-enroll cleanup (2) + post-verify refresh (3)
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalledTimes(3));
    // success message clears enroll panel
    await waitFor(() => expect(screen.getByText("Authenticator enrolled and verified")).toBeTruthy());
  });

  it("supports challenge and verify for an existing verified factor (step-up)", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockResolvedValue({
      data: {
        totp: [{ id: "factor-verified-1", status: "verified", factor_type: "totp" }],
        all: [{ id: "factor-verified-1", status: "verified", factor_type: "totp" }],
      },
      error: null,
    } as never);
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());
    expect(await screen.findByText("Enabled")).toBeTruthy();
    expect(screen.getByTestId("mfa-verified")).toBeTruthy();

    // First challenge — from handleChallenge (shows the verify panel)
    await user.click(screen.getByRole("button", { name: "Verify with code" }));
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: "factor-verified-1" });
    await waitFor(() => expect(screen.getByTestId("mfa-verify-panel")).toBeTruthy());

    await user.type(screen.getByLabelText("Verification code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    // handleVerify always creates a fresh challenge before calling verify
    expect(mocks.challenge).toHaveBeenCalledTimes(2);
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "factor-verified-1", challengeId: "challenge-1", code: "654321" });
    await waitFor(() => expect(screen.getByText("Code verified successfully")).toBeTruthy());
  });

  it("unenrolls a verified factor after confirmation", async () => {
    const user = userEvent.setup();
    mocks.listFactors.mockResolvedValue({
      data: {
        totp: [{ id: "factor-verified-1", status: "verified", factor_type: "totp" }],
        all: [{ id: "factor-verified-1", status: "verified", factor_type: "totp" }],
      },
      error: null,
    } as never);
    // jsdom window.confirm default is true unless stubbed; ensure true
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Remove authenticator" }));
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: "factor-verified-1" });
    await waitFor(() => expect(screen.getByText("Authenticator removed")).toBeTruthy());
    (window.confirm as unknown as ReturnType<typeof vi.spyOn>).mockRestore?.();
  });

  it("surfaces enroll, challenge and verify errors", async () => {
    const user = userEvent.setup();
    render(<MfaSettings />);
    await waitFor(() => expect(mocks.listFactors).toHaveBeenCalled());

    mocks.enroll.mockResolvedValue({ data: null, error: { message: "Enroll failed" } } as never);
    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Enroll failed");

    // recover enroll for next part
    mocks.enroll.mockResolvedValue({
      data: { id: "factor-new", totp: { qr_code: "data:image/svg+xml;utf-8,<svg>qr</svg>", secret: "S", uri: "u" } },
      error: null,
    } as never);
    await user.click(screen.getByRole("button", { name: "Enroll authenticator" }));
    await waitFor(() => expect(screen.getByTestId("mfa-enroll-panel")).toBeTruthy());
    await user.type(screen.getByLabelText("Verification code"), "000000");
    mocks.verify.mockResolvedValue({ data: null, error: { message: "Invalid code" } } as never);
    await user.click(screen.getByRole("button", { name: "Verify and activate" }));
    // The component wraps Supabase's "invalid" errors with a friendlier message
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Incorrect code"));
  });

  it("shows empty error state when listFactors fails", async () => {
    mocks.listFactors.mockResolvedValue({ data: null, error: { message: "Network error" } } as never);
    render(<MfaSettings />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Network error");
  });
});
