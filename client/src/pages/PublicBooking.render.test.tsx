// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PublicBooking from "./PublicBooking";

const mocks = vi.hoisted(() => ({
  publicHotelQuery: vi.fn(),
  siteConfigQuery: vi.fn(),
  availabilityQuery: vi.fn(),
  servicesQuery: vi.fn(),
  mutate: vi.fn(),
  firstCheckIn: undefined as string | null | undefined,
}));

vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: {
  publicHotel: { useQuery: (...args: unknown[]) => mocks.publicHotelQuery(...args) },
  getHotelSiteConfig: { useQuery: (...args: unknown[]) => mocks.siteConfigQuery(...args) },
  publicHotelAvailability: { useQuery: (...args: unknown[]) => mocks.availabilityQuery(...args) },
  listPublicHotelServices: { useQuery: (...args: unknown[]) => mocks.servicesQuery(...args) },
  holdRoomType: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
  confirmBookingDetails: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
} } }));
vi.mock("@/components/public-hotel/PublicBookingSection", () => ({
  default: ({ page }: any) => {
    // The date picker only reads its dates on mount, so the steps must first appear with the query dates.
    if (mocks.firstCheckIn === undefined) mocks.firstCheckIn = page.booking?.checkIn ?? null;
    return <div data-testid="booking-steps">preferred:{page.booking?.preferredRoomTypeId ?? "none"}</div>;
  },
}));
vi.mock("@/lib/pageMeta", () => ({ usePageMeta: vi.fn() }));

const hotelData = {
  hotel: { id: "hotel-1", name: "Sample Stay", slug: "sample-stay", address: "12 River Road", public_phone: "081-234-5678", line_url: "https://line.me/R/ti/p/@sample" },
  roomTypes: [{ id: "room-1", name: "Garden Room", capacity: 2, basePrice: 1800, childRule: "age" }],
  media: [],
};

beforeEach(() => {
  mocks.firstCheckIn = undefined;
  mocks.publicHotelQuery.mockReturnValue({ data: hotelData, isLoading: false, error: null, refetch: vi.fn() });
  mocks.siteConfigQuery.mockReturnValue({ data: { theme: "lanna-teak", accentColor: "#ffdd00", heroCopy: "", visibleSections: null }, isLoading: false, error: null });
  mocks.availabilityQuery.mockReturnValue({ data: { room_types: [] }, isLoading: false, error: null });
  mocks.servicesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("PublicBooking page", () => {
  it("shows the hotel bar, the reassurance banner and the booking steps", () => {
    window.history.replaceState(null, "", "/sample-stay/book");
    const view = render(<PublicBooking slug="sample-stay" />);
    const bar = view.container.querySelector<HTMLElement>(".booking-page");
    expect(bar?.style.getPropertyValue("--booking-page-accent")).toBe("#ffdd00");
    expect(bar?.style.getPropertyValue("--booking-page-accent-text")).toBe("#000000");
    expect(screen.getByRole("link", { name: "Sample Stay" }).getAttribute("href")).toBe("/sample-stay");
    expect(screen.getByText("12 River Road")).toBeTruthy();
    expect(view.container.querySelector('a[href="tel:081-234-5678"]')).toBeTruthy();
    expect(screen.getByTestId("booking-steps").textContent).toBe("preferred:none");
  });

  it("fills the room type and dates from the query once the hotel is loaded", () => {
    window.history.replaceState(null, "", "/sample-stay/book?roomType=room-1&checkIn=2099-01-10&checkOut=2099-01-12");
    render(<PublicBooking slug="sample-stay" />);
    expect(screen.getByTestId("booking-steps").textContent).toBe("preferred:room-1");
    const lastInput = mocks.availabilityQuery.mock.calls.at(-1)?.[0] as { check_in: string; check_out: string };
    expect(lastInput.check_in).toBe("2099-01-10");
    expect(lastInput.check_out).toBe("2099-01-12");
    expect(mocks.firstCheckIn).toBe("2099-01-10");
  });

  it("ignores a room type the hotel does not have", () => {
    window.history.replaceState(null, "", "/sample-stay/book?roomType=room-x");
    render(<PublicBooking slug="sample-stay" />);
    expect(screen.getByTestId("booking-steps").textContent).toBe("preferred:none");
  });

  it("shows the unavailable state for an unknown hotel", () => {
    mocks.publicHotelQuery.mockReturnValue({ data: undefined, isLoading: false, error: { data: { code: "NOT_FOUND" } }, refetch: vi.fn() });
    render(<PublicBooking slug="missing" />);
    expect(screen.getByTestId("public-booking-not-found")).toBeTruthy();
  });
});
