// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffPermissionToggles } from "./StaffPermissionToggles";
import { resolveMembershipPermissions } from "@shared/permissions";
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { access: { updateStaffPermissions: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) } } } }));
afterEach(() => { cleanup(); mocks.mutate.mockReset(); });
describe("staff permission switches", () => {
  it("switching on a dependent capability sends its dependencies and the scoped target", async () => {
    render(<StaffPermissionToggles hotelId="a" actor={{ userId: "owner", role: "hotel_owner", permissions: resolveMembershipPermissions("hotel_owner") }} target={{ userId: "staff", role: "housekeeping", permissions: resolveMembershipPermissions("housekeeping") }} onSaved={async () => {}} />);
    await userEvent.click(screen.getByLabelText("Manage bookings and guests"));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "a", targetUserId: "staff", permissions: expect.arrayContaining(["operations.view_bookings", "operations.manage_bookings", "operations.manage_guests"]) }));
  });
  it("owner and self switches are disabled", () => {
    render(<StaffPermissionToggles hotelId="a" actor={{ userId: "owner", role: "hotel_owner", permissions: resolveMembershipPermissions("hotel_owner") }} target={{ userId: "owner", role: "hotel_owner", permissions: resolveMembershipPermissions("hotel_owner") }} onSaved={async () => {}} />);
    expect(screen.getAllByRole("checkbox", { hidden: true }).every(input => (input as HTMLInputElement).disabled)).toBe(true);
  });
});
