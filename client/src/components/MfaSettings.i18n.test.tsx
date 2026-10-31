// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn() } } }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ auth: { me: { invalidate: vi.fn() } } }),
  auth: { me: { useQuery: () => ({ data: { twoFactorEnabled: false }, isLoading: false, error: null }) } },
} }));

import MfaSettings from "./MfaSettings";
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); });

describe("MfaSettings in Thai", () => {
  it("shows the security card in Thai (regression: it was English on the Thai security page)", () => {
    render(<MfaSettings />);
    expect(screen.getByRole("heading", { name: "การยืนยันตัวตนสองขั้นตอน" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ลงทะเบียนแอปยืนยันตัวตน" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Two-factor|Enroll authenticator|Not enabled/);
  });
});
