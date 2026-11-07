// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveRange, refetchCalendar } = vi.hoisted(() => ({ saveRange: vi.fn().mockResolvedValue({ success: true }), refetchCalendar: vi.fn().mockResolvedValue({}) }));

vi.mock("@/contexts/HotelContext", () => ({ useHotel: () => ({ selectedHotelId: "hotel-1" }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/hotels/hotel-1/calendar", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("./useOneCalendar", () => ({ useOneCalendar: () => ({
  dates: Array.from({ length: 30 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`),
  hotel: { data: { id: "hotel-1" }, isLoading: false, error: null },
  calendar: { data: { rows: [], canSeePrice: true }, isLoading: false, error: null, refetch: refetchCalendar },
  roomTypes: [{ id: "room-type-1", name: "Deluxe", totalRooms: 2 }, { id: "room-type-2", name: "Family", totalRooms: 1 }],
  canManageRates: true, canManageAllotment: true,
  save: { mutateAsync: saveRange, isPending: false },
}) }));

import OneCalendar from "./OneCalendar";
(globalThis as { React?: typeof React }).React = React;

afterEach(() => { cleanup(); saveRange.mockReset().mockResolvedValue({ success: true }); refetchCalendar.mockClear(); });

describe("rate calendar save", () => {
  it("sends the last night, rather than check-out, as the inclusive end_date", async () => {
    const view = render(<OneCalendar id="hotel-1" />);
    const days = view.container.querySelectorAll<HTMLButtonElement>(".one-calendar-day");
    fireEvent.click(days[28]!);
    fireEvent.click(days[29]!);
    fireEvent.change(screen.getAllByLabelText("Price per night")[0]!, { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveRange).toHaveBeenCalledWith(expect.objectContaining({
      room_type_ids: ["room-type-1"], start_date: "2026-11-29", end_date: "2026-11-29", price: 1200,
    })));
    expect(saveRange).toHaveBeenCalledTimes(1);
  });

  it("keeps each room card's price and rooms separate", () => {
    const view = render(<OneCalendar id="hotel-1" />);
    const days = view.container.querySelectorAll<HTMLButtonElement>(".one-calendar-day");
    fireEvent.click(days[0]!); fireEvent.click(days[1]!);
    const prices = screen.getAllByLabelText<HTMLInputElement>("Price per night");
    const rooms = screen.getAllByLabelText<HTMLInputElement>("Rooms for sale");
    fireEvent.change(prices[0]!, { target: { value: "1500" } });
    fireEvent.change(rooms[0]!, { target: { value: "2" } });
    expect(prices[0]!.value).toBe("1500");
    expect(prices[1]!.value).toBe("");
    expect(rooms[0]!.value).toBe("2");
    expect(rooms[1]!.value).toBe("");
  });

  it("shows the failed room type and keeps successful results visible", async () => {
    saveRange.mockImplementation(async input => { if (input.room_type_ids[0] === "room-type-2") throw new Error("fail"); return { success: true }; });
    const view = render(<OneCalendar id="hotel-1" />);
    const days = view.container.querySelectorAll<HTMLButtonElement>(".one-calendar-day");
    fireEvent.click(days[0]!); fireEvent.click(days[1]!);
    const prices = screen.getAllByLabelText<HTMLInputElement>("Price per night");
    fireEvent.change(prices[0]!, { target: { value: "1500" } });
    fireEvent.change(prices[1]!, { target: { value: "2200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(refetchCalendar).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe("Changes saved");
    expect(screen.getByRole("alert").textContent).toContain("Family");
    expect(prices[0]!.value).toBe("");
    expect(prices[1]!.value).toBe("2200");
    expect(saveRange).toHaveBeenCalledTimes(2);
    fireEvent.change(prices[0]!, { target: { value: "1600" } });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
