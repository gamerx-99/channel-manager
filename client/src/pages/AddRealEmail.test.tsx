// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { socialPlaceholderEmail } from "@shared/socialAuth";
import { emailTokenFromSearch, mustAddRealEmail, rememberEmailToken, takeEmailToken } from "@/lib/realEmailGate";

type MutationOptions = { onSuccess?: (result: unknown, variables: any) => void; onError?: (error: { data?: { code?: string } }) => void };
const mocks = vi.hoisted(() => ({
  requestMutate: vi.fn(),
  confirmMutate: vi.fn(),
  requestOptions: {} as MutationOptions,
  confirmOptions: {} as MutationOptions,
  signOut: vi.fn(async () => ({})),
  match: { kind: "none" } as { kind: "none" } | { kind: "free"; email: string } | { kind: "taken"; email: string; accountName: string; signInMethods: string[] },
  useSocialEmailMutate: vi.fn(),
  discardMutateAsync: vi.fn(async () => ({ removed: true })),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      addRealEmail: { useMutation: (options: MutationOptions) => { mocks.requestOptions = options; return { mutate: mocks.requestMutate, isPending: false }; } },
      confirmRealEmail: { useMutation: (options: MutationOptions) => { mocks.confirmOptions = options; return { mutate: mocks.confirmMutate, isPending: false }; } },
      socialEmailMatch: { useQuery: () => ({ data: mocks.match, isLoading: false }) },
      useSocialEmail: { useMutation: () => ({ mutate: mocks.useSocialEmailMutate, isPending: false }) },
      discardSocialSignup: { useMutation: () => ({ mutateAsync: mocks.discardMutateAsync, isPending: false }) },
    },
  },
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: mocks.signOut } }));

import AddRealEmail from "./AddRealEmail";

const TOKEN = "ab".repeat(32);
const assign = vi.fn();
beforeEach(() => {
  mocks.requestMutate.mockReset();
  mocks.confirmMutate.mockReset();
  mocks.signOut.mockClear();
  mocks.match = { kind: "none" };
  mocks.useSocialEmailMutate.mockReset();
  mocks.discardMutateAsync.mockClear();
  assign.mockReset();
  localStorage.clear();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("add-email screen with a Facebook email", () => {
  it("uses a free Facebook email at once, without asking", () => {
    mocks.match = { kind: "free", email: "guest@example.test" };
    render(<AddRealEmail />);
    expect(mocks.useSocialEmailMutate).toHaveBeenCalledOnce();
  });

  it("asks before using an existing account, and on yes removes the new account and goes to sign in to link Facebook", async () => {
    mocks.match = { kind: "taken", email: "owner@example.test", accountName: "Tanutcha S.", signInMethods: ["google"] };
    render(<AddRealEmail />);
    expect(screen.getByTestId("add-email-existing").textContent).toContain("Tanutcha S.");
    expect(screen.getByTestId("add-email-existing").textContent).toContain("Google");
    await userEvent.setup().click(screen.getByRole("button", { name: "Yes, sign in with this account" }));
    expect(mocks.discardMutateAsync).toHaveBeenCalledOnce();
    expect(localStorage.getItem("hayhost.linkAfterSignIn")).toBe("facebook");
    expect(assign).toHaveBeenCalledWith("/login?link=facebook");
  });

  it("on no removes the new account and goes back to sign-in, without linking", async () => {
    mocks.match = { kind: "taken", email: "owner@example.test", accountName: "Tanutcha S.", signInMethods: ["google"] };
    render(<AddRealEmail />);
    await userEvent.setup().click(screen.getByRole("button", { name: "No, back to sign-in" }));
    expect(mocks.discardMutateAsync).toHaveBeenCalledOnce();
    expect(localStorage.getItem("hayhost.linkAfterSignIn")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });
});

describe("add-email screen", () => {
  it("sends a link to the typed address, then offers to send again or use another email", async () => {
    const user = userEvent.setup();
    render(<AddRealEmail />);
    await user.type(screen.getByLabelText("Email"), " Owner@Example.test ");
    await user.click(screen.getByRole("button", { name: "Send link" }));
    expect(mocks.requestMutate).toHaveBeenCalledWith({ email: "Owner@Example.test" });
    expect(mocks.confirmMutate).not.toHaveBeenCalled();

    act(() => mocks.requestOptions.onSuccess?.({ status: true }, { email: "Owner@Example.test" }));
    expect(screen.getByRole("status").textContent).toContain("owner@example.test");

    await user.click(screen.getByRole("button", { name: "Send again" }));
    expect(mocks.requestMutate).toHaveBeenLastCalledWith({ email: "owner@example.test" });

    await user.click(screen.getByRole("button", { name: "Use another email" }));
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("says so when the link cannot be sent", () => {
    render(<AddRealEmail />);
    act(() => mocks.requestOptions.onError?.({ data: { code: "TOO_MANY_REQUESTS" } }));
    expect(screen.getByRole("alert").textContent).toBe("Could not send the link. Wait a moment and try again.");
  });

  it("uses a link opened before signing in, once, and reloads the app when it works", () => {
    rememberEmailToken(TOKEN);
    render(<AddRealEmail />);
    expect(mocks.confirmMutate).toHaveBeenCalledWith({ token: TOKEN });
    expect(takeEmailToken()).toBeNull();
    act(() => mocks.confirmOptions.onSuccess?.({ email: "owner@example.test" }, { token: TOKEN }));
    expect(assign).toHaveBeenCalledWith("/dashboard");
  });

  it("tells another account that the link is not theirs", () => {
    rememberEmailToken(TOKEN);
    render(<AddRealEmail />);
    act(() => mocks.confirmOptions.onError?.({ data: { code: "FORBIDDEN" } }));
    expect(screen.getByRole("alert").textContent).toContain("belongs to another account");
  });

  it("signs out and goes to the home page", async () => {
    render(<AddRealEmail />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/");
  });
});

describe("who is asked", () => {
  it("asks only accounts whose email is a LINE or Facebook placeholder", () => {
    expect(mustAddRealEmail({ email: socialPlaceholderEmail("line", "U1") })).toBe(true);
    expect(mustAddRealEmail({ email: socialPlaceholderEmail("facebook", "F1") })).toBe(true);
    expect(mustAddRealEmail({ email: "owner@example.test" })).toBe(false);
    expect(mustAddRealEmail(null)).toBe(false);
  });

  it("reads only a well-formed token from the link", () => {
    expect(emailTokenFromSearch(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(emailTokenFromSearch("?token=../../x")).toBeNull();
    expect(emailTokenFromSearch("")).toBeNull();
  });

  it("is checked by the private route before the owner terms and the app shell", () => {
    const route = readFileSync(resolve(process.cwd(), "client/src/components/auth/PrivateRoute.tsx"), "utf8");
    expect(route).toContain("if (mustAddRealEmail(authMe)) {");
    expect(route.indexOf("mustAddRealEmail(authMe)")).toBeLessThan(route.indexOf("mustAcceptOwnerTerms(authMe)"));
    expect(route.indexOf("mustAddRealEmail(authMe)")).toBeLessThan(route.indexOf("<AppShell"));
  });
});
