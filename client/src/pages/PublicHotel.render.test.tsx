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
  mocks.siteConfigQuery.mockImplementation(() => ({ data: mocks.loaded && mocks.theme ? { theme: mocks.theme, heroCopy: "A welcoming place to rest.", accentColor: "#954831", visibleSections: null } : null, isLoading: false, error: null }));
  mocks.availabilityQuery.mockReturnValue({ data: { room_types: [] }, isLoading: false, error: null });
  mocks.servicesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
});
afterEach(() => cleanup());

describe.each([null, "minimal-white", "lanna-teak", "cafe-homestay"] as const)("PublicHotel loading to data with theme %s", (theme) => {
  it("renders loading first, then hotel data without a hook-order crash", () => {
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(screen.getByRole("status")).toBeTruthy();
    mocks.loaded = true;
    mocks.theme = theme;
    expect(() => view.rerender(<PublicHotel slug="sample-stay" />)).not.toThrow();
    expect(screen.getByRole("heading", { name: "Sample Stay" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Sample Stay" }).getAttribute("style")).toContain("object-position: 27% 73%");
    // The booking steps live on the hayhost booking page now, not inside the hotel website.
    expect(view.container.querySelector("#book")).toBeNull();
  });

  it("sends the book button and every room card to the booking page", () => {
    mocks.loaded = true;
    mocks.theme = theme;
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(view.container.querySelector('a[href="/sample-stay/book"]')).toBeTruthy();
    expect(view.container.querySelector('a[href="/sample-stay/book?roomType=room-1"]')?.textContent).toBe("Garden Room");
    expect(view.container.querySelector('a[href="#book"]')).toBeNull();
  });

  it("hides the book links when the hotel switched the booking section off", () => {
    mocks.loaded = true;
    mocks.siteConfigQuery.mockReturnValue({ data: { theme, accentColor: "#954831", heroCopy: "Rest here.", visibleSections: { booking: false } }, isLoading: false, error: null });
    const view = render(<PublicHotel slug="sample-stay" />);
    expect(view.container.querySelector('a[href^="/sample-stay/book"]')).toBeNull();
  });

  it("uses contrast text for hotel-accent calls to action", () => {
    mocks.loaded = true;
    mocks.theme = theme;
    mocks.siteConfigQuery.mockReturnValue({ data: { theme, accentColor: "#ffdd00", heroCopy: "Rest here.", visibleSections: null }, isLoading: false, error: null });
    const view = render(<PublicHotel slug="sample-stay" />);
    if (theme) {
      const themedPage = view.container.querySelector<HTMLElement>(`.theme-${theme}`);
      expect(themedPage?.style.getPropertyValue("--owner-accent")).toBe("#ffdd00");
      expect(themedPage?.style.getPropertyValue("--owner-accent-text")).toBe("#000000");
    } else {
      for (const selector of [".public-nav-cta", ".public-hero-content .public-button"]) {
        const cta = view.container.querySelector<HTMLElement>(selector);
        expect(cta?.style.backgroundColor).toBe("rgb(255, 221, 0)");
        expect(cta?.style.color).toBe("rgb(0, 0, 0)");
      }
    }
  });
});
