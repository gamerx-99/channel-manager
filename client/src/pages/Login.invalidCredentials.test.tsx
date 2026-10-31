// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en, th } from "@/lib/i18n";

const signInEmail = vi.hoisted(() => vi.fn());

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/login", vi.fn()], Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> };
});
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { email: signInEmail }, twoFactor: { verifyTotp: vi.fn() } } }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ auth: { me: { fetch: vi.fn() } } }) } }));

import Login from "./Login";

afterEach(() => { cleanup(); signInEmail.mockReset(); });

async function signIn() {
  const user = userEvent.setup();
  render(<Login />);
  await user.type(screen.getByLabelText(/Email address/), "owner@example.com");
  await user.type(screen.getByLabelText(/^Password/), "wrong-password");
  await user.click(screen.getByRole("button", { name: /Continue/ }));
}

describe("Login wrong credentials", () => {
  it("has the invalidCredentials key in both languages", () => {
    expect(en.login.invalidCredentials).toBe("The email or password is incorrect.");
    expect(th.login.invalidCredentials).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  });

  it("shows our message instead of Better Auth's English one", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401, message: "Invalid email or password" } });
    await signIn();
    expect((await screen.findByRole("alert")).textContent).toBe("The email or password is incorrect.");
  });

  it("keeps other server messages, such as rate limiting", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 429, message: "Too many requests. Please try again later." } });
    await signIn();
    expect((await screen.findByRole("alert")).textContent).toBe("Too many requests. Please try again later.");
  });
});
