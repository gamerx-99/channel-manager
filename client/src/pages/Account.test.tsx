// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: {
    data: undefined as unknown,
    isLoading: false,
    error: null as { message: string } | null,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/lib/trpc", () => ({ trpc: { auth: { profile: { useQuery: () => mocks.profile } } } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));

import Account from "./Account";
(globalThis as { React?: typeof React }).React = React;

const profile = {
  id: "u1",
  name: "Anan Rakthai",
  firstName: "Anan",
  lastName: "Rakthai",
  phone: "0812345678",
  email: "anan@example.test",
  emailVerified: true,
  linkedAccounts: ["credential", "google"],
  ownedHotels: [
    { id: "h-a", name: "Baan Ruam", slug: "baan-ruam", publicEnabled: false, plan: "free", planEndsAt: null, daysLeft: 0 },
    { id: "h-b", name: "Doi View", slug: "doi-view", publicEnabled: true, plan: "pro", planEndsAt: "2026-12-01T00:00:00.000Z", daysLeft: 10 },
  ],
};

afterEach(() => { cleanup(); mocks.profile.data = undefined; mocks.profile.error = null; mocks.profile.isLoading = false; });

describe("Account page", () => {
  it("shows the personal details, email, linked sign-in methods and owned hotels", () => {
    mocks.profile.data = profile;
    render(<Account />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Personal information");
    for (const text of ["Anan", "Rakthai", "Anan Rakthai", "0812345678", "anan@example.test", "Email verified"]) expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
    expect(screen.getByText("Email and password")).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Baan Ruam" }).getAttribute("href")).toBe("/hotels/h-a");
    expect(screen.getByRole("link", { name: "Doi View" }).getAttribute("href")).toBe("/hotels/h-b");
  });

  it("gives each hotel its own plan, and says the plan belongs to the hotel (regression: a plan was thought to belong to the account)", () => {
    mocks.profile.data = profile;
    render(<Account />);
    const rows = screen.getAllByRole("listitem");
    const baan = rows.find(row => within(row).queryByText("Baan Ruam"))!;
    const doi = rows.find(row => within(row).queryByText("Doi View"))!;
    expect(within(baan).getByText("Free")).toBeTruthy();
    expect(within(baan).queryByText(/days left|left/i)).toBeNull();
    expect(within(doi).getByText("Pro")).toBeTruthy();
    expect(within(doi).getByText(/10/)).toBeTruthy();
    expect(within(doi).getByRole("link", { name: "Change plan" }).getAttribute("href")).toBe("/hotels/h-b/billing");
    expect(screen.getByText(/A plan belongs to each property, not to the account/)).toBeTruthy();
  });

  it("marks details the account has not filled in, and shows an empty hotel list", () => {
    mocks.profile.data = { ...profile, firstName: null, lastName: "", phone: null, emailVerified: false, linkedAccounts: [], ownedHotels: [] };
    render(<Account />);
    expect(screen.getAllByText("Not provided")).toHaveLength(3);
    expect(screen.getByText("Email not verified")).toBeTruthy();
    expect(screen.getByText("No sign-in methods are linked yet.")).toBeTruthy();
    expect(screen.getByText("This account does not own a property yet.")).toBeTruthy();
  });

  it("shows a loading state and an error with a retry", () => {
    mocks.profile.isLoading = true;
    const view = render(<Account />);
    expect(screen.getByText("Loading your personal information")).toBeTruthy();
    view.unmount();
    mocks.profile.isLoading = false;
    mocks.profile.error = { message: "Boom" };
    render(<Account />);
    expect(screen.getByText("Boom")).toBeTruthy();
  });
});
