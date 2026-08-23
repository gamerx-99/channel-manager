// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HotelStaff from "./HotelStaff";

const mocks = vi.hoisted(() => {
  const query = {
    data: {
      hotel: { id: "hotel-1", name: "Little Bro" },
      staff: [
        {
          id: "membership-1",
          hotel_id: "hotel-1",
          user_id: "user-1",
          role: "front_desk",
          email: "frontdesk@example.com",
          created_at: "2026-08-19T04:00:00.000Z",
          confirmed_at: "2026-08-19T04:10:00.000Z",
          last_sign_in_at: null,
        },
      ],
    },
    isLoading: false,
    error: null as { message: string } | null,
    refetch: vi.fn(),
  };

  const auditQuery = {
    data: [] as Array<{
      id: string;
      hotel_id: string;
      actor_user_id: string;
      actor_email: string | null;
      action: "hotel_admin_transfer";
      previous_admin_membership_id: string;
      previous_admin_user_id: string;
      new_admin_membership_id: string;
      new_admin_user_id: string;
      details: Record<string, unknown>;
      created_at: string;
    }>,
    isLoading: false,
    error: null as { message: string } | null,
    refetch: vi.fn(),
  };

  const mutations = {
    invite: { isPending: false, mutate: vi.fn() },
    updateRole: { isPending: false, mutate: vi.fn() },
    remove: { isPending: false, mutate: vi.fn() },
    transfer: { isPending: false, mutate: vi.fn() },
  };

  return {
    query,
    auditQuery,
    mutations,
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      channelManager: {
        hotels: { invalidate: mocks.invalidate },
        dashboard: { invalidate: mocks.invalidate },
      },
    }),
    channelManager: {
      hotelStaff: { useQuery: vi.fn(() => mocks.query) },
      listHotelAdminAuditLogs: { useQuery: vi.fn(() => mocks.auditQuery) },
      inviteHotelStaff: { useMutation: vi.fn(() => mocks.mutations.invite) },
      updateHotelStaffRole: { useMutation: vi.fn(() => mocks.mutations.updateRole) },
      removeHotelStaff: { useMutation: vi.fn(() => mocks.mutations.remove) },
      transferHotelAdmin: { useMutation: vi.fn(() => mocks.mutations.transfer) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(() => cleanup());

beforeEach(() => {
  mocks.query.data = {
    hotel: { id: "hotel-1", name: "Little Bro" },
    staff: [
      {
        id: "membership-1",
        hotel_id: "hotel-1",
        user_id: "user-1",
        role: "front_desk",
        email: "frontdesk@example.com",
        created_at: "2026-08-19T04:00:00.000Z",
        confirmed_at: "2026-08-19T04:10:00.000Z",
        last_sign_in_at: null,
      },
    ],
  };
  mocks.query.isLoading = false;
  mocks.query.error = null;
  mocks.query.refetch.mockReset();
  mocks.auditQuery.data = [];
  mocks.auditQuery.isLoading = false;
  mocks.auditQuery.error = null;
  mocks.auditQuery.refetch.mockReset();
  mocks.mutations.invite.mutate.mockReset();
  mocks.mutations.updateRole.mutate.mockReset();
  mocks.mutations.remove.mutate.mockReset();
  mocks.mutations.transfer.mutate.mockReset();
});

describe("HotelStaff", () => {
  it("renders the RLS-scoped property team and role options", () => {
    render(<HotelStaff id="hotel-1" />);

    expect(screen.getByRole("heading", { name: /Hotel staff/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Little Bro team" })).toBeTruthy();
    expect(screen.getByText("frontdesk@example.com")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Role for frontdesk@example.com" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Super Admin" })).toBeNull();
    expect(screen.getByText(/limited to this hotel/)).toBeTruthy();
  });

  it("disables the Hotel Admin option and explains the one-admin rule when an admin already exists", async () => {
    const user = userEvent.setup();
    mocks.query.data.staff = [
      {
        id: "membership-owner",
        hotel_id: "hotel-1",
        user_id: "owner-1",
        role: "hotel_owner",
        email: "owner@example.com",
        created_at: "2026-08-18T04:00:00.000Z",
        confirmed_at: "2026-08-18T04:10:00.000Z",
        last_sign_in_at: null,
      },
      ...mocks.query.data.staff,
    ];
    render(<HotelStaff id="hotel-1" />);

    const staffRole = screen.getByRole("combobox", { name: "Role for frontdesk@example.com" });
    const staffAdminOption = within(staffRole).getByRole("option", { name: /Hotel Admin/ });
    expect(staffAdminOption).toHaveProperty("disabled", true);
    expect(screen.getByText(/Only one Hotel Admin is allowed per hotel/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Invite staff" }));
    const inviteRole = screen.getByRole("combobox", { name: "Hotel role" });
    const inviteAdminOption = within(inviteRole).getByRole("option", { name: /Hotel Admin/ });
    expect(inviteAdminOption).toHaveProperty("disabled", true);
    const inviteDialog = screen.getByRole("dialog", { name: "Invite hotel staff" });
    expect(within(inviteDialog).getByTitle(/Only one Hotel Admin is allowed per hotel/)).toBeTruthy();
    expect(within(inviteDialog).getByText(/Hotel Admin is unavailable because this hotel already has one administrator/)).toBeTruthy();
  });

  it("invites a hotel-level staff member with the selected role", async () => {
    const user = userEvent.setup();
    render(<HotelStaff id="hotel-1" />);

    await user.click(screen.getByRole("button", { name: "Invite staff" }));
    await user.type(screen.getByLabelText("Email address"), "  Revenue@example.com ");
    await user.selectOptions(screen.getByLabelText("Hotel role"), "revenue_manager");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(mocks.mutations.invite.mutate).toHaveBeenCalledWith({
      hotel_id: "hotel-1",
      email: "revenue@example.com",
      role: "revenue_manager",
    });
  });

  it("requires explicit confirmation before changing a staff role", async () => {
    const user = userEvent.setup();
    render(<HotelStaff id="hotel-1" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Role for frontdesk@example.com" }), "housekeeping");

    expect(screen.getByRole("dialog", { name: "Confirm role change" })).toBeTruthy();
    expect(screen.getByText(/Review the new role before continuing/)).toBeTruthy();
    expect(mocks.mutations.updateRole.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm role change" }));
    expect(mocks.mutations.updateRole.mutate).toHaveBeenCalledWith({
      hotel_id: "hotel-1",
      membership_id: "membership-1",
      role: "housekeeping",
    });
  });

  it("requires explicit confirmation before transferring Hotel Admin access", async () => {
    const user = userEvent.setup();
    mocks.query.data.staff = [
      {
        id: "membership-owner",
        hotel_id: "hotel-1",
        user_id: "owner-1",
        role: "hotel_owner",
        email: "owner@example.com",
        created_at: "2026-08-18T04:00:00.000Z",
        confirmed_at: "2026-08-18T04:10:00.000Z",
        last_sign_in_at: null,
      },
      ...mocks.query.data.staff,
    ];
    render(<HotelStaff id="hotel-1" />);

    await user.click(screen.getByRole("button", { name: "Transfer Hotel Admin" }));
    const transferDialog = screen.getByRole("dialog", { name: "Transfer Hotel Admin" });
    await user.selectOptions(within(transferDialog).getByRole("combobox", { name: "New Hotel Admin" }), "membership-1");
    await user.click(within(transferDialog).getByRole("button", { name: "Review transfer" }));

    const confirmationDialog = screen.getByRole("dialog", { name: "Transfer Hotel Admin?" });
    expect(confirmationDialog).toBeTruthy();
    expect(within(confirmationDialog).getByText(/from owner@example.com to frontdesk@example.com/)).toBeTruthy();
    const transferSummary = within(confirmationDialog).getByLabelText("Hotel Admin transfer summary");
    expect(transferSummary.textContent).toContain("owner@example.com");
    expect(transferSummary.textContent).toContain("frontdesk@example.com");
    expect(mocks.mutations.transfer.mutate).not.toHaveBeenCalled();

    await user.click(within(confirmationDialog).getByRole("button", { name: "Transfer Hotel Admin" }));
    expect(mocks.mutations.transfer.mutate).toHaveBeenCalledWith({
      hotel_id: "hotel-1",
      target_membership_id: "membership-1",
    });
  });

  it("requires explicit confirmation before removing a staff member and supports cancellation", async () => {
    const user = userEvent.setup();
    render(<HotelStaff id="hotel-1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog", { name: "Remove staff member?" })).toBeTruthy();
    expect(mocks.mutations.remove.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Remove staff member?" })).toBeNull();
    expect(mocks.mutations.remove.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Remove staff member" }));
    expect(mocks.mutations.remove.mutate).toHaveBeenCalledWith({
      hotel_id: "hotel-1",
      membership_id: "membership-1",
    });
  });

  it("renders transfer audit history and opens the full event detail", async () => {
    const user = userEvent.setup();
    mocks.query.data.staff = [
      {
        id: "membership-owner",
        hotel_id: "hotel-1",
        user_id: "owner-1",
        role: "hotel_owner",
        email: "owner@example.com",
        created_at: "2026-08-18T04:00:00.000Z",
        confirmed_at: "2026-08-18T04:10:00.000Z",
        last_sign_in_at: null,
      },
      ...mocks.query.data.staff,
    ];
    mocks.auditQuery.data = [{
      id: "audit-1",
      hotel_id: "hotel-1",
      actor_user_id: "owner-1",
      actor_email: "owner@example.com",
      action: "hotel_admin_transfer",
      previous_admin_membership_id: "membership-owner",
      previous_admin_user_id: "owner-1",
      new_admin_membership_id: "membership-1",
      new_admin_user_id: "user-1",
      details: { previousRole: "hotel_owner", newRole: "hotel_owner", reason: "planned handover" },
      created_at: "2026-08-19T05:00:00.000Z",
    }];
    render(<HotelStaff id="hotel-1" />);

    expect(screen.getByText("Hotel Admin transferred")).toBeTruthy();
    expect(screen.getByText((_, element) => Boolean(
      element?.tagName === "P" && element.textContent?.includes("owner@example.com transferred access from owner@example.com to frontdesk@example.com"),
    ))).toBeTruthy();
    expect(screen.getByText("Event ID: audit-1")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "View details" }));
    const detailDialog = screen.getByRole("dialog", { name: "Hotel Admin transfer details" });
    expect(detailDialog.textContent).toContain("Recorded by owner@example.com");
    expect(within(detailDialog).getByText("frontdesk@example.com")).toBeTruthy();
    expect(within(detailDialog).getByText("hotel_admin_transfer")).toBeTruthy();

    await user.click(within(detailDialog).getByText("View full event payload"));
    expect(within(detailDialog).getByText(/planned handover/)).toBeTruthy();
  });

  it("exposes loading and error states without leaking another property", () => {
    mocks.query.isLoading = true;
    const { rerender } = render(<HotelStaff id="hotel-1" />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Loading hotel staff/)).toBeTruthy();

    mocks.query.isLoading = false;
    mocks.query.error = { message: "Property access denied" };
    rerender(<HotelStaff id="hotel-1" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Property access denied")).toBeTruthy();
    expect(screen.queryByText("frontdesk@example.com")).toBeNull();
  });
});
