// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMenu } from "./WorkspaceMenu";

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
        isSuperAdmin
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
        isSuperAdmin
      />,
    );

    const menu = screen.getByRole("menu", { name: "Workspace options" });
    expect(menu.className).toContain("workspace-dropdown");
    expect(screen.getByRole("menuitem", { name: "All properties overview" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Little Bro/ })).toBeTruthy();

    await user.click(screen.getByRole("menuitem", { name: "All properties overview" }));
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
        isSuperAdmin={false}
        activeHotelName="Little Bro"
      />,
    );

    expect(screen.getByRole("button", { name: "เลือกโรงแรม Little Bro" })).toBeTruthy();
    expect(screen.getByText("Property workspace")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Property overview" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "All properties overview" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Little Bro/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Other Hotel/ })).toBeNull();
  });
});
