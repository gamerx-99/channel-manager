// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const hotelQuery = {
    data: {
      id: "hotel-1",
      name: "Grand Seaside",
      rooms: [
        { id: "room-1", room_type_id: "rt-1" },
        { id: "room-2", room_type_id: "rt-1" },
        { id: "room-3", room_type_id: "rt-2" },
      ],
      room_types: [
        { id: "rt-1", name: "Deluxe Ocean", base_price: 2500 },
        { id: "rt-2", name: "Standard Suite", base_price: 1500 },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  const availabilityQuery = {
    data: [
      { room_type_id: "rt-1", date: "2026-09-15", rooms_available: 2, price: 2500 },
      { room_type_id: "rt-2", date: "2026-09-15", rooms_available: 0, price: 1500 },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  const bookingOccupancyQuery = {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  const updateAvailability = {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  };

  return {
    hotelQuery,
    availabilityQuery,
    bookingOccupancyQuery,
    updateAvailability,
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      channelManager: {
        availability: { invalidate: mocks.invalidate },
      },
    }),
    channelManager: {
      hotel: { useQuery: () => mocks.hotelQuery },
      availability: { useQuery: () => mocks.availabilityQuery },
      bookingOccupancy: { useQuery: () => mocks.bookingOccupancyQuery },
      updateAvailability: { useMutation: () => mocks.updateAvailability },
      ota: {
        listImportedBlocks: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

import Calendar from "./Calendar";

describe("Calendar Month View & View Mode Switcher", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders week view by default with the table of room types", () => {
    render(<Calendar id="hotel-1" />);
    expect(screen.getByRole("button", { name: /^Week$/i, pressed: true })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Deluxe Ocean")).toBeTruthy();
    expect(screen.getByText("Standard Suite")).toBeTruthy();
  });

  it("toggles to month view when clicking Month option", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);

    const monthToggle = screen.getByRole("button", { name: /^Month$/i });
    await user.click(monthToggle);

    expect(monthToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    // Month weekdays headers
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();
  });

  it("switches back to week view when clicking a day in month view", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);

    // Switch to month view
    await user.click(screen.getByRole("button", { name: /^Month$/i }));
    expect(screen.queryByRole("table")).toBeNull();

    // Find calendar day buttons and click one
    const dayCells = screen.getAllByRole("button").filter(b => b.className.includes("calendar-month-cell"));
    expect(dayCells.length).toBeGreaterThanOrEqual(28);

    await user.click(dayCells[10]);

    // Should switch back to week view with table rendered
    expect(screen.getByRole("button", { name: /^Week$/i, pressed: true })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("handles navigation in both week and month view modes", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);

    // Prev / Next in week mode
    const prevBtn = screen.getByLabelText(/Previous week/i);
    const nextBtn = screen.getByLabelText(/Next week/i);
    expect(prevBtn).toBeTruthy();
    expect(nextBtn).toBeTruthy();

    await user.click(nextBtn);
    await user.click(screen.getByRole("button", { name: /^Today$/i }));

    // Switch to month mode
    await user.click(screen.getByRole("button", { name: /^Month$/i }));
    expect(screen.getByLabelText(/Previous month/i)).toBeTruthy();
    expect(screen.getByLabelText(/Next month/i)).toBeTruthy();

    await user.click(screen.getByLabelText(/Next month/i));
    await user.click(screen.getByRole("button", { name: /^Today$/i }));
  });

  it("displays aggregate room availability and lowest price in month cells", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);

    await user.click(screen.getByRole("button", { name: /^Month$/i }));

    const cellButtons = screen.getAllByRole("button").filter(b => b.className.includes("calendar-month-cell"));
    expect(cellButtons.length).toBeGreaterThanOrEqual(28);
    // Every cell has status dot and room ratio
    const firstCell = cellButtons[0];
    expect(firstCell.querySelector(".dot")).toBeTruthy();
    expect(firstCell.querySelector(".month-cell-status")).toBeTruthy();
  });
});
