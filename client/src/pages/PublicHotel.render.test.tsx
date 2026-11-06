// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PublicHotel from "./PublicHotel";

const mocks = vi.hoisted(() => ({
  loaded: false,
  theme: null as string | null,
  publicHotelQuery: vi.fn(),
  siteConfigQuery: vi.fn(),
  availabilityQuery: vi.fn(),
  servicesQuery: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: {
  publicHotel: { useQuery: (...args: unknown[]) => mocks.publicHotelQuery(...args) },
  getHotelSiteConfig: { useQuery: (...args: unknown[]) => mocks.siteConfigQuery(...args) },
  publicHotelAvailability: { useQuery: (...args: unknown[]) => mocks.availabilityQuery(...args) },
  listPublicHotelServices: { useQuery: (...args: unknown[]) => mocks.servicesQuery(...args) },
  holdRoomType: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
  confirmBookingDetails: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
} } }));
vi.mock("@/lib/pageMeta", () => ({ usePageMeta: vi.fn() }));

const hotelData = {
  hotel: { id: "hotel-1", name: "Sample Stay", slug: "sample-stay", address: "12 River Road" },
  roomTypes: [{ id: "room-1", name: "Garden Room", capacity: 2, basePrice: 1800, childRule: "age" }],
  media: [{ url: "/hero.jpg", is_hero: true, objectPosition: "27% 73%" }],
};

beforeEach(() => {
  mocks.loaded = false;
  mocks.theme = null;
  mocks.publicHotelQuery.mockImplementation(() => mocks.loaded
    ? { data: hotelData, isLoading: false, error: null, refetch: vi.fn() }
    : { data: undefined, isLoading: true, error: null, refetch: vi.fn() });
  mocks.siteConfigQuery.mockImplementation(() => ({ data: mocks.loaded && mocks.theme ? { theme: mocks.theme, heroCopy: "A welcoming place to rest.", accentColor: "#ffdd00", visibleSections: null } : null, isLoading: false, error: null }));
  mocks.availabilityQuery.mockReturnValue({ data: { room_types: [] }, isLoading: false, error: null });
  mocks.servicesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
});
afterEach(() => cleanup());

describe.each([null, "minimal-white", "lanna-teak", "cafe-homestay", "mountain-mist"] as const)("PublicHotel loading to data with theme %s", (theme) => {
  it("renders loading first, then hotel data without a hook-order crash", () => {
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(screen.getByRole("status")).toBeTruthy();
    mocks.loaded = true;
    mocks.theme = theme;
    expect(() => view.rerender(<PublicHotel slug="sample-stay" />)).not.toThrow();
    if (theme === "mountain-mist") expect(view.container.querySelector(".hero-title")?.textContent).toBe("Sample Stay");
    else expect(screen.getByRole("heading", { name: "Sample Stay" })).toBeTruthy();
    if (theme !== "mountain-mist") expect(screen.getByRole("img", { name: "Sample Stay" }).getAttribute("style")).toContain("object-position: 27% 73%");
    // The booking steps live on the hayhost booking page now, not inside the hotel website.
    expect(view.container.querySelector("#book")).toBeNull();
  });

  it("sends the book button and every room card to the booking page", () => {
    mocks.loaded = true;
    mocks.theme = theme;
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(view.container.querySelector('a[href="/sample-stay/book"]')).toBeTruthy();
    expect(view.container.querySelector('a[href="/sample-stay/book?roomType=room-1"]')?.textContent).toBe(theme === "mountain-mist" ? "Choose this room" : "Garden Room");
    expect(view.container.querySelector('a[href="#book"]')).toBeNull();
  });

  it("hides the book links when the hotel switched the booking section off", () => {
    mocks.loaded = true;
    mocks.siteConfigQuery.mockReturnValue({ data: { theme, heroCopy: "Rest here.", accentColor: "#ffdd00", visibleSections: { booking: false } }, isLoading: false, error: null });
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(view.container.querySelector('a[href^="/sample-stay/book"]')).toBeNull();
  });

  it("uses the theme palette for calls to action, ignoring any stored hotel colour", () => {
    mocks.loaded = true;
    mocks.theme = theme;
    mocks.siteConfigQuery.mockReturnValue({ data: { theme, heroCopy: "Rest here.", accentColor: "#ffdd00", visibleSections: null }, isLoading: false, error: null });
    const view = render(<PublicHotel slug="sample-stay" />);
    if (theme) {
      const themedPage = view.container.querySelector<HTMLElement>(`.theme-${theme}`);
      const expected: Record<string, string> = { "minimal-white": "#34423a", "lanna-teak": "#6b3f2a", "cafe-homestay": "#8d4e35", "mountain-mist": "#e0a458" };
      const expectedText: Record<string, string> = { "minimal-white": "#ffffff", "lanna-teak": "#ffffff", "cafe-homestay": "#ffffff", "mountain-mist": "#1f3b2d" };
      expect(themedPage?.style.getPropertyValue("--owner-accent")).toBe(expected[theme]);
      expect(themedPage?.style.getPropertyValue("--owner-accent-text")).toBe(expectedText[theme]);
    } else {
      for (const selector of [".public-nav-cta", ".public-hero-content .public-button"]) {
        const cta = view.container.querySelector<HTMLElement>(selector);
        expect(cta?.style.backgroundColor).toBe("rgb(149, 72, 49)");
        expect(cta?.style.color).toBe("rgb(255, 255, 255)");
      }
    }
  });
});
