// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SupportAccess from "./SupportAccess";
import { resolveMembershipPermissions } from "@shared/permissions";
const mocks = vi.hoisted(() => ({ grant: vi.fn(), revoke: vi.fn(), allowed: true }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  auth: { me: { useQuery: () => ({ data: { roles: ["hotel_owner"], memberships: [{ hotelId: "a", role: "hotel_owner", permissions: mocks.allowed ? resolveMembershipPermissions("hotel_owner") : [] }] } }) } },
  access: {
    supportAccess: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { grants: [{ id: "key", supportUserId: "support", mode: "view", expiresAt: new Date("2099-01-01"), revokedAt: null, hotelId: "a" }], log: [{ id: "log", supportUserId: "support", action: "hotel.read", createdAt: new Date(), grantId: "key" }] } }) },
    grantSupport: { useMutation: () => ({ mutate: mocks.grant, isPending: false }) },
    revokeSupport: { useMutation: () => ({ mutate: mocks.revoke, isPending: false }) },
  },
  useUtils: () => ({ auth: { me: { invalidate: vi.fn() } }, channelManager: { hotels: { invalidate: vi.fn() } } }),
} }));
afterEach(() => { cleanup(); mocks.grant.mockReset(); mocks.revoke.mockReset(); mocks.allowed = true; });
describe("owner support approval", () => {
  it("offers exactly the approved durations and defaults to one-hour view-only access", async () => {
    render(<SupportAccess hotelId="a" />);
    const duration = screen.getByLabelText("Duration") as HTMLSelectElement;
    expect(Array.from(duration.options).map(option => option.value)).toEqual(["1", "24", "72", "168"]);
    await userEvent.type(screen.getByLabelText("Support email"), "support@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Approve support key" }));
    expect(mocks.grant).toHaveBeenCalledWith({ hotelId: "a", supportEmail: "support@example.test", durationHours: 1, mode: "view" });
    expect(screen.getByText(/hotel.read/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Revoke key" }));
    expect(mocks.revoke).toHaveBeenCalledWith({ hotelId: "a", grantId: "key" });
  });
  it("withholds owner approval controls without the hotel-specific owner permission", () => {
    mocks.allowed = false;
    render(<SupportAccess hotelId="a" />);
    expect(screen.getByRole("alert").textContent).toContain("Only the hotel owner");
    expect(screen.queryByRole("button", { name: "Approve support key" })).toBeNull();
  });
});
