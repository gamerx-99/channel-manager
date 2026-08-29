// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfileMenu from "./ProfileMenu";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("ProfileMenu", () => {
  afterEach(cleanup);

  const baseProps = {
    userEmail: "owner@example.com",
    userName: "Hotel Owner",
    initials: "HO",
    onLogout: vi.fn(),
    onClose: vi.fn(),
  };

  it("limits hotel_owner to the active property and hides super-admin access", () => {
    render(<ProfileMenu {...baseProps} isPlatformAdmin={false} propertyName="Little Bro" />);

    expect(screen.queryByText("Admin Users & Access")).toBeNull();
    expect(screen.getByText("Little Bro · Hotel Admin")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Manage Little Bro property" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows global access and Admin Users for super_admin", () => {
    render(<ProfileMenu {...baseProps} isPlatformAdmin canManageUsers roleLabel="Super Admin" propertyName={undefined} />);

    expect(screen.getByText("Super Admin · Global access")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Admin Users & Access" }).getAttribute("href")).toBe("/settings/admin-users");
    expect(screen.getByRole("menuitem", { name: "Manage Properties" }).getAttribute("href")).toBe("/hotels");
  });

  it("gives the read-only platform admin global access without the Admin Users console", () => {
    render(
      <ProfileMenu
        {...baseProps}
        isPlatformAdmin
        canManageUsers={false}
        roleLabel="Platform Admin (read-only)"
        propertyName={undefined}
      />,
    );

    expect(screen.getByText("Platform Admin (read-only) · Global access")).toBeTruthy();
    expect(screen.queryByText("Admin Users & Access")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Manage Properties" }).getAttribute("href")).toBe("/hotels");
  });
});
