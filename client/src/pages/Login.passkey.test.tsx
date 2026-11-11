// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInPasskey: vi.fn(),
  navigate: vi.fn(),
  me: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/login", mocks.navigate], Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> };
});
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: vi.fn(), passkey: mocks.signInPasskey }, twoFactor: { verifyTotp: vi.fn() } } }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ auth: { me: { fetch: mocks.me } } }), auth: { socialProviders: { useQuery: () => ({ data: [] }) } } } }));

import Login from "./Login";

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class {});
  mocks.me.mockResolvedValue({ roles: ["hotel_owner"], twoFactorEnabled: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.signInPasskey.mockReset();
  mocks.navigate.mockReset();
  mocks.me.mockReset();
});

describe("Login with a passkey", () => {
  it("offers the passkey button and lets the browser autofill the email field", () => {
    render(<Login />);
    expect(screen.getByRole("button", { name: /Sign in with a passkey/ })).toBeTruthy();
    expect(screen.getByLabelText(/Email address/).getAttribute("autocomplete")).toBe("username webauthn");
  });

  it("hides the button when the browser has no passkey support", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<Login />);
    expect(screen.queryByRole("button", { name: /Sign in with a passkey/ })).toBeNull();
  });

  it("signs in with a passkey and goes to the dashboard like a password sign-in", async () => {
    mocks.signInPasskey.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole("button", { name: /Sign in with a passkey/ }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signInPasskey).toHaveBeenCalledWith({ autoFill: false });
  });

  it("shows nothing alarming when the person closes the prompt", async () => {
    mocks.signInPasskey.mockResolvedValue({ data: null, error: { code: "AUTH_CANCELLED", message: "cancelled", status: 400 } });
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole("button", { name: /Sign in with a passkey/ }));
    await waitFor(() => expect(mocks.signInPasskey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows a short friendly message when the passkey is rejected", async () => {
    mocks.signInPasskey.mockResolvedValue({ data: null, error: { code: "PASSKEY_NOT_FOUND", message: "Passkey not found", status: 401 } });
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole("button", { name: /Sign in with a passkey/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not sign in with a passkey. Try again, or use your email and password.");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("starts the autofill prompt when the browser supports it, and stays quiet if it ends", async () => {
    vi.stubGlobal("PublicKeyCredential", class { static isConditionalMediationAvailable = async () => true; });
    mocks.signInPasskey.mockResolvedValue({ data: null, error: { code: "AUTH_CANCELLED", message: "cancelled", status: 400 } });
    render(<Login />);
    await waitFor(() => expect(mocks.signInPasskey).toHaveBeenCalledWith({ autoFill: true }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
