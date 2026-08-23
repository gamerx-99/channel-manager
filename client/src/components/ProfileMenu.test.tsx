// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfileMenu from "./ProfileMenu";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("ProfileMenu", () => {
  const baseProps = {
    userEmail: "owner@example.com",
    userName: "Hotel Owner",
    initials: "HO",
    onLogout: vi.fn(),
    onClose: vi.fn(),
  };

  it("limits hotel_owner to the active property and hides super-admin access", () => {
    render(<ProfileMenu {...baseProps} isSuperAdmin={false} propertyName="Little Bro" />);

    expect(screen.queryByText("Admin Users & Access")).toBeNull();
    expect(screen.getByText("Little Bro · Hotel Admin")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Manage Little Bro property" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows global access and Admin Users only for super_admin", () => {
    render(<ProfileMenu {...baseProps} isSuperAdmin propertyName={undefined} />);

    expect(screen.getByText("Super Admin · Global access")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Admin Users & Access" }).getAttribute("href")).toBe("/settings/admin-users");
    expect(screen.getByRole("menuitem", { name: "Manage Properties" }).getAttribute("href")).toBe("/hotels");
  });
});
