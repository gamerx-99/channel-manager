// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mutateAsync = vi.fn();
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: {
  dashboardCalendar: { useQuery: () => ({ isLoading: false, isFetching: false, error: null, refetch: vi.fn(), data: {
    startDate: "2026-11-01", endDate: "2026-11-14", generatedAt: "2026-11-01T00:00:00.000Z",
    hotels: [{ hotel: { id: "h", name: "Hotel" }, roomTypes: [{ id: "t", name: "Deluxe", totalRooms: 2 }],
      days: [{ date: "2026-11-01", bookings: 0, roomTypes: [{ roomTypeId: "t", available: 2, totalRooms: 2, price: 100, status: "healthy", cap: 2 }], syncEvents: [] }] }],
  } }) },
  updateAvailability: { useMutation: () => ({ mutateAsync, isPending: false }) },
} } }));

import DashboardCalendarView from "./DashboardCalendarView";
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); mutateAsync.mockClear(); });

describe("DashboardCalendarView stop sell (phase 1)", () => {
  it("does not render the rooms-available input or Save button in the overview", () => {
    render(<DashboardCalendarView canEditAvailability={true} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Stop sales" })).toBeTruthy();
  });

  it("sends 0 when stopping sales", () => {
    render(<DashboardCalendarView canEditAvailability={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop sales" }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].rooms_available).toBe(0);
    expect(mutateAsync.mock.calls[0][0].action).toBe("stop_sell");
  });
});
