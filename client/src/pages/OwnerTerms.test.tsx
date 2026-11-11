// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mustAcceptOwnerTerms } from "@/lib/ownerTermsGate";

const mocks = vi.hoisted(() => ({
  acceptMutate: vi.fn(),
  acceptOptions: {} as { onSuccess?: () => Promise<void> | void; onError?: () => void },
  invalidateMe: vi.fn(),
  signOut: vi.fn(async () => ({})),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { invalidate: mocks.invalidateMe } } }),
    auth: { acceptTerms: { useMutation: (options: typeof mocks.acceptOptions) => { mocks.acceptOptions = options; return { mutate: mocks.acceptMutate, isPending: false }; } } },
  },
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: mocks.signOut } }));

import OwnerTerms from "./OwnerTerms";

function setBox(box: HTMLElement, sizes: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  Object.defineProperty(box, "scrollHeight", { configurable: true, value: sizes.scrollHeight });
  Object.defineProperty(box, "clientHeight", { configurable: true, value: sizes.clientHeight });
  box.scrollTop = sizes.scrollTop;
}

const assign = vi.fn();
beforeEach(() => {
  mocks.acceptMutate.mockReset();
  mocks.signOut.mockClear();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("owner terms screen", () => {
  it("keeps Accept locked until the terms are scrolled to the end", async () => {
    render(<OwnerTerms />);
    const accept = screen.getByTestId("owner-terms-accept") as HTMLButtonElement;
    const box = screen.getByTestId("owner-terms-box");
    // jsdom reports zero sizes; give the box a long document that is not yet scrolled.
    setBox(box, { scrollTop: 0, clientHeight: 300, scrollHeight: 2000 });
    fireEvent.scroll(box);
    expect(accept.disabled).toBe(true);
    expect(screen.getByText("Scroll to the end to accept")).toBeTruthy();

    setBox(box, { scrollTop: 1600, clientHeight: 300, scrollHeight: 2000 });
    fireEvent.scroll(box);
    expect(accept.disabled).toBe(true);

    setBox(box, { scrollTop: 1695, clientHeight: 300, scrollHeight: 2000 });
    fireEvent.scroll(box);
    expect(accept.disabled).toBe(false);

    await userEvent.setup().click(accept);
    expect(mocks.acceptMutate).toHaveBeenCalledOnce();
    await act(async () => { await mocks.acceptOptions.onSuccess?.(); });
    expect(mocks.invalidateMe).toHaveBeenCalled();
  });

  it("shows the real terms text", () => {
    render(<OwnerTerms />);
    expect(screen.getByTestId("owner-terms-box").querySelectorAll("section").length).toBeGreaterThan(0);
  });

  it("signs out and goes to the home page on Decline", async () => {
    render(<OwnerTerms />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Decline" }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("says so when saving the acceptance fails", () => {
    render(<OwnerTerms />);
    act(() => { mocks.acceptOptions.onError?.(); });
    expect(screen.getByRole("alert").textContent).toBe("Could not save your acceptance. Try again.");
  });
});

describe("who is asked", () => {
  it("asks only hotel owners who have not accepted yet", () => {
    expect(mustAcceptOwnerTerms({ memberships: [{ role: "hotel_owner" }], termsAcceptedAt: null })).toBe(true);
    expect(mustAcceptOwnerTerms({ memberships: [{ role: "hotel_owner" }], termsAcceptedAt: "2026-11-11T09:00:00.000Z" })).toBe(false);
    expect(mustAcceptOwnerTerms({ memberships: [{ role: "front_desk" }], termsAcceptedAt: null })).toBe(false);
    expect(mustAcceptOwnerTerms({ memberships: [], termsAcceptedAt: null })).toBe(false);
    expect(mustAcceptOwnerTerms(null)).toBe(false);
  });

  it("is checked by the private route before the app shell, and the CRM shows the date", () => {
    const route = readFileSync(resolve(process.cwd(), "client/src/components/auth/PrivateRoute.tsx"), "utf8");
    expect(route).toContain("if (mustAcceptOwnerTerms(authMe)) {");
    expect(route.indexOf("mustAcceptOwnerTerms(authMe)")).toBeLessThan(route.indexOf("<AppShell"));
    const crm = readFileSync(resolve(process.cwd(), "client/src/pages/PlatformCrm.tsx"), "utf8");
    expect(crm).toContain("row.ownerTermsAcceptedAt");
  });
});
