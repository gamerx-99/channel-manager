// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfileMenu from "./ProfileMenu";
import { en } from "@/lib/i18n";

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
    render(<ProfileMenu {...baseProps} isPlatformAdmin={false} propertyName="Little Bro" propertyId="hotel-1" />);

    expect(screen.queryByText("Admin Users & Access")).toBeNull();
    expect(screen.getByText("Little Bro · Hotel Admin")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: en.profileMenu.manageProperty.replace("{{name}}", "Little Bro") }).getAttribute("href")).toBe("/hotels/hotel-1");
  });

  it("shows global access and Admin Users for super_admin", () => {
    render(<ProfileMenu {...baseProps} isPlatformAdmin canManageUsers roleLabel="Super Admin" propertyName={undefined} />);

    expect(screen.getByText("Super Admin · Global access")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: en.profileMenu.adminUsers }).getAttribute("href")).toBe("/settings/admin-users");
    expect(screen.getByRole("menuitem", { name: en.profileMenu.manageProperties }).getAttribute("href")).toBe("/hotels");
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
    expect(screen.queryByText(en.profileMenu.adminUsers)).toBeNull();
    expect(screen.getByRole("menuitem", { name: en.profileMenu.manageProperties }).getAttribute("href")).toBe("/hotels");
  });

  it("offers hotel setup without showing a property label when the account has none", () => {
    render(<ProfileMenu {...baseProps} isPlatformAdmin={false} />);
    expect(screen.getByRole("menuitem", { name: en.profileMenu.setupHotel }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByText(en.profileMenu.myProperty)).toBeNull();
  });
});
