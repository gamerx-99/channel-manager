// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: [
    { roomTypeId: "type-stop", date: "2026-11-01", roomsAvailable: 0, totalRooms: 2, availableRooms: 0, closed: true, price: "1200.00" },
    { roomTypeId: "type-full", date: "2026-11-01", roomsAvailable: 1, totalRooms: 1, availableRooms: 0, closed: false, price: "900.00" },
    { roomTypeId: "type-open", date: "2026-11-01", roomsAvailable: 2, totalRooms: 3, availableRooms: 1, closed: false, price: "1500.00" },
  ],
}));

vi.mock("@/contexts/HotelContext", () => ({ useHotel: () => ({ selectedHotelId: "hotel-1" }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/hotels/hotel-1/calendar", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("./useOneCalendar", () => ({ useOneCalendar: () => ({
  dates: Array.from({ length: 30 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`),
  hotel: { data: { id: "hotel-1" }, isLoading: false, error: null },
  calendar: { data: { rows: fixture.rows, canSeePrice: true }, isLoading: false, error: null, refetch: vi.fn() },
  roomTypes: [
    { id: "type-stop", name: "Stop Sell", totalRooms: 2 },
    { id: "type-full", name: "Full House", totalRooms: 1 },
    { id: "type-open", name: "Garden Room", totalRooms: 3 },
  ],
  canManageRates: true, canManageAllotment: true, canManageStopSell: true,
  save: { mutateAsync: vi.fn(), isPending: false },
}) }));

import OneCalendar from "./OneCalendar";
(globalThis as { React?: typeof React }).React = React;

afterEach(cleanup);

describe("OneCalendar monthly view", () => {
  it("shows real per-room-type prices and distinguishes stop sell, full, and available rooms", () => {
    const view = render(<OneCalendar id="hotel-1" />);
    const day = view.container.querySelector<HTMLButtonElement>(".one-calendar-day");
    expect(day?.textContent).toContain("Stop Sell");
    expect(day?.textContent).toContain("Close for sale");
    expect(day?.textContent).toContain("Full House");
    expect(day?.textContent).toContain("Unavailable");
    expect(day?.textContent).toContain("Garden Room");
    expect(day?.textContent).toContain("1/3");
    expect(day?.textContent).toContain("฿1,200");
    expect(day?.textContent).toContain("฿900");
    expect(day?.textContent).toContain("฿1,500");
    expect(day?.getAttribute("aria-label")).toContain("Stop Sell: Close for sale 0/2, ฿1,200");
    expect(day?.querySelector('[data-status="stop-sell"]')).toBeTruthy();
    expect(day?.querySelector('[data-status="full"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Timeline" })).toBeNull();
  });

  it("keeps date selection and room-type filtering available in the monthly calendar", () => {
    const view = render(<OneCalendar id="hotel-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Select room type Stop Sell" }));
    const day = view.container.querySelector<HTMLButtonElement>(".one-calendar-day")!;
    expect(day.textContent).toContain("Stop Sell");
    expect(day.textContent).not.toContain("Garden Room");
    const days = view.container.querySelectorAll<HTMLButtonElement>(".one-calendar-day");
    fireEvent.click(days[0]!);
    fireEvent.click(days[1]!);
    expect(screen.getByText("Edit 1 night · Nov 1, 2026")).toBeTruthy();
    expect(days[0]?.className).toContain("is-selected");
    expect(days[1]?.className).toContain("is-checkout");
  });
});
