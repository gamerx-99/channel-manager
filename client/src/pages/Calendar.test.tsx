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
    data: [] as any[],
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
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

import Calendar from "./Calendar";

describe("Availability month calendar", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bookingOccupancyQuery.data = [];
  });

  it("renders one month calendar and has no week/month switcher", () => {
    render(<Calendar id="hotel-1" />);
    expect(screen.queryByRole("button", { name: /^Week$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Month$/i })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
    expect(screen.getByLabelText("Next month")).toBeTruthy();
  });

  it("counts each room type's rooms from the hotel's rooms (regression: every type showed 0 rooms)", () => {
    render(<Calendar id="hotel-1" />);
    expect(screen.getAllByText("2 rooms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 rooms").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 rooms")).toBeNull();
  });

  it("uses the three-click IN, OUT, IN range selection", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);
    const cells = screen.getAllByRole("button").filter(button => button.className.includes("calendar-month-cell") && !button.className.includes("is-outside"));
    expect(cells.length).toBeGreaterThanOrEqual(28);
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();

    await user.click(cells[2]);
    expect(screen.getByText("Click a date to set OUT; click again to start a new range.")).toBeTruthy();
    await user.click(cells[5]);
    expect(cells[5].textContent).toContain("OUT");
    await user.click(cells[8]);
    expect(screen.getByText("Click a date to set OUT; click again to start a new range.")).toBeTruthy();
  });

  it("lets a selected date change group IN/OUT and edit price only", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);
    const cell = screen.getAllByRole("button").find(button => button.className.includes("calendar-month-cell") && !button.className.includes("is-outside"));
    expect(cell).toBeTruthy();
    await user.click(cell!);
    await user.click(screen.getByRole("button", { name: "Set all OUT" }));
    await user.click(screen.getByRole("button", { name: "Edit prices" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.updateAvailability.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.updateAvailability.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ rooms_available: 0 }));

    await user.click(screen.getByRole("button", { name: "Edit prices" }));
    expect(screen.getAllByLabelText("Price").length).toBe(2);
    expect(screen.queryByLabelText("Available rooms")).toBeNull();
  });

  it("shows bookings in a dark date tile with their OTA platform", () => {
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const checkout = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    mocks.bookingOccupancyQuery.data = [{
      roomId: "room-1", checkIn: iso, checkOut: checkout, status: "confirmed", expiresAt: null,
      source: "ota_ical", guestName: "Booking.com ? CLOSED - Not available",
    }];
    render(<Calendar id="hotel-1" />);
    const bookedCell = screen.getAllByRole("button").find(button => button.className.includes("calendar-month-cell") && button.className.includes("has-booking"));
    expect(bookedCell).toBeTruthy();
    expect(bookedCell?.textContent).toContain("Booking.com");
  });

  it("navigates month by month and returns to today", async () => {
    const user = userEvent.setup();
    render(<Calendar id="hotel-1" />);
    await user.click(screen.getByLabelText("Next month"));
    await user.click(screen.getByRole("button", { name: /^Today$/i }));
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
  });
});
