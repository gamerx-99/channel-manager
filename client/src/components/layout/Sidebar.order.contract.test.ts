import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sidebar = read("client/src/components/layout/Sidebar.tsx");

// Owner request 2026-11-11: the hotel's public website link in the navigation, and a tidier order.
describe("Sidebar public site link", () => {
  it("sits under the hotel switcher and opens the guest page in a new tab", () => {
    expect(sidebar).toContain('data-testid="sidebar-public-site-link"');
    expect(sidebar).toContain("href={`/${selectedHotel.slug}`}");
    expect(sidebar).toContain('target="_blank"');
    expect(sidebar).toContain('rel="noopener noreferrer"');
    expect(sidebar.indexOf("<WorkspaceMenu")).toBeLessThan(sidebar.indexOf('data-testid="sidebar-public-site-link"'));
    expect(sidebar.indexOf('data-testid="sidebar-public-site-link"')).toBeLessThan(sidebar.indexOf('<nav className="nav-list"'));
  });

  it("says when the site is not published yet, instead of showing a status pill", () => {
    expect(sidebar).toContain('t("sidebar.viewPublicSiteDraft")');
    expect(sidebar).not.toContain("sidebar-hotel-meta");
  });
});

describe("Sidebar order", () => {
  const at = (needle: string) => {
    const index = sidebar.indexOf(needle);
    expect(index, needle).toBeGreaterThan(-1);
    return index;
  };

  it("runs overview, bookings, rooms and pricing, extra services, website builder, staff, then the system section", () => {
    const order = [
      at('{ href: "/dashboard", label:'),
      at("...hotelNavItems"),
      at('t("sidebar.roomsAndPricing")'),
      at('t("sidebar.services")'),
      at('t("sidebar.websiteBuilder")'),
      at('t("sidebar.staff")'),
      at('t("sidebar.system")'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps the website builder out of the staff section", () => {
    expect(at('t("sidebar.websiteBuilder")')).toBeLessThan(at('t("sidebar.staff")'));
  });
});
