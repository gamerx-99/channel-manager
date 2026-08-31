// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HotelProvider, useHotel, SELECTED_HOTEL_STORAGE_KEY, type VisibleHotel } from "./HotelContext";

// Mock wouter's useLocation hook
let mockLocation = "/dashboard";
vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, (to: string) => { mockLocation = to; }],
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channelManager: {
      hotels: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

const mockHotels: VisibleHotel[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Grand Sunset Resort", slug: "grand-sunset" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Blue Lagoon Haven", slug: "blue-lagoon" },
  { id: "33333333-3333-3333-3333-333333333333", name: "Mountain View Lodge", slug: "mountain-view" },
];

function TestConsumer() {
  const { hotels, selectedHotel, selectedHotelId, setSelectedHotelId, clearSelectedHotel } = useHotel();
  return (
    <div>
      <div data-testid="hotel-count">{hotels.length}</div>
      <div data-testid="selected-id">{selectedHotelId ?? "none"}</div>
      <div data-testid="selected-name">{selectedHotel?.name ?? "none"}</div>
      <button
        onClick={() => setSelectedHotelId("22222222-2222-2222-2222-222222222222")}
        data-testid="select-hotel-2"
      >
        Select Hotel 2
      </button>
      <button
        onClick={() => setSelectedHotelId("unauthorized-or-unknown-hotel-id")}
        data-testid="select-unauthorized"
      >
        Select Unauthorized
      </button>
      <button onClick={() => clearSelectedHotel()} data-testid="clear-hotel">
        Clear Hotel
      </button>
    </div>
  );
}

describe("HotelContext & HotelProvider (Phase 11A)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockLocation = "/dashboard";
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("throws an error when useHotel is called outside HotelProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useHotel must be used within a HotelProvider");
    spy.mockRestore();
  });

  it("defaults to the first allowed hotel when localStorage is empty", () => {
    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[0].name);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[0].id);
  });

  it("restores the selected hotel from localStorage when it is valid in allowed hotels", () => {
    localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, mockHotels[1].id);

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[1].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[1].name);
  });

  it("falls back to first allowed hotel if stored ID in localStorage is not in allowed hotels list", () => {
    localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, "99999999-9999-9999-9999-999999999999");

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[0].name);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[0].id);
  });

  it("updates selectedHotel and persists to localStorage when setSelectedHotelId is called with a valid hotel", async () => {
    const user = userEvent.setup();

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);

    await user.click(screen.getByTestId("select-hotel-2"));

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[1].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[1].name);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[1].id);
  });

  it("rejects selecting an unauthorized or unknown hotel ID", async () => {
    const user = userEvent.setup();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);

    await user.click(screen.getByTestId("select-unauthorized"));

    // Selection should not change
    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[0].id);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Attempted to select unauthorized or unknown hotel"));

    warnSpy.mockRestore();
  });

  it("syncs with route parameter if the current URL is /hotels/:id and valid", () => {
    mockLocation = `/hotels/${mockHotels[2].id}/bookings`;

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[2].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[2].name);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[2].id);
  });

  it("handles zero hotels gracefully without crashing", () => {
    render(
      <HotelProvider hotels={[]}>
        <TestConsumer />
      </HotelProvider>
    );

    expect(screen.getByTestId("hotel-count").textContent).toBe("0");
    expect(screen.getByTestId("selected-id").textContent).toBe("none");
    expect(screen.getByTestId("selected-name").textContent).toBe("none");
  });

  it("resets selection to default hotel when clearSelectedHotel is called", async () => {
    const user = userEvent.setup();

    render(
      <HotelProvider hotels={mockHotels}>
        <TestConsumer />
      </HotelProvider>
    );

    await user.click(screen.getByTestId("select-hotel-2"));
    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[1].id);

    await user.click(screen.getByTestId("clear-hotel"));

    expect(screen.getByTestId("selected-id").textContent).toBe(mockHotels[0].id);
    expect(screen.getByTestId("selected-name").textContent).toBe(mockHotels[0].name);
    expect(localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY)).toBe(mockHotels[0].id);
  });
});
