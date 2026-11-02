// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { en } from "@/lib/i18n";

afterEach(() => cleanup());

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("WorkspaceMenu", () => {
  it("opens an accessible, layered menu and closes after selecting a workspace", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <WorkspaceMenu
        open={false}
        onToggle={onToggle}
        onClose={onClose}
        hotels={[{ id: "hotel-1", name: "Little Bro", slug: "little-bro" }]}
        isPlatformAdmin
      />,
    );

    expect(screen.queryByRole("menu")).toBeNull();
    const trigger = screen.getByRole("button", { name: "เลือก workspace และโรงแรม" });
    await user.click(trigger);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceMenu
        open
        onToggle={onToggle}
        onClose={onClose}
        hotels={[{ id: "hotel-1", name: "Little Bro", slug: "little-bro" }]}
        isPlatformAdmin
      />,
    );

    const menu = screen.getByRole("menu", { name: en.workspaceMenu.workspaceOptions });
    expect(menu.className).toContain("workspace-dropdown");
    expect(screen.getByRole("menuitem", { name: en.workspaceMenu.allPropertiesOverview })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Little Bro/ })).toBeTruthy();

    await user.click(screen.getByRole("menuitem", { name: en.workspaceMenu.allPropertiesOverview }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("scopes the workspace menu to the assigned property for hotel owners", () => {
    render(
      <WorkspaceMenu
        open
        onToggle={vi.fn()}
        onClose={vi.fn()}
        hotels={[
          { id: "hotel-1", name: "Little Bro", slug: "little-bro" },
          { id: "hotel-2", name: "Other Hotel", slug: "other-hotel" },
        ]}
        isPlatformAdmin={false}
        activeHotelName="Little Bro"
      />,
    );

    expect(screen.getByRole("button", { name: "เลือกโรงแรม Little Bro" })).toBeTruthy();
    expect(screen.getByText(en.workspaceMenu.propertyWorkspace)).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: en.workspaceMenu.propertyOverview })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: en.workspaceMenu.allPropertiesOverview })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Little Bro/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Other Hotel/ })).toBeNull();
  });

  it("shows an empty state after the hotel query has loaded with no hotels", () => {
    render(<WorkspaceMenu open onToggle={vi.fn()} onClose={vi.fn()} hotels={[]} />);
    expect(screen.getByText(en.workspaceMenu.emptyHotels)).toBeTruthy();
    expect(screen.queryByText(en.workspaceMenu.loadingAssignedProperties)).toBeNull();
  });
});
