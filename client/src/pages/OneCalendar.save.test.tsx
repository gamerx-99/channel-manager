// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveRange } = vi.hoisted(() => ({ saveRange: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock("@/contexts/HotelContext", () => ({ useHotel: () => ({ selectedHotelId: "hotel-1" }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/hotels/hotel-1/calendar", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("./useOneCalendar", () => ({ useOneCalendar: () => ({
  dates: Array.from({ length: 30 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`),
  hotel: { data: { id: "hotel-1" }, isLoading: false, error: null },
  calendar: { data: { rows: [], canSeePrice: true }, isLoading: false, error: null },
  roomTypes: [{ id: "room-type-1", name: "Double", totalRooms: 1 }],
  canManageRates: true, canManageAllotment: true,
  save: { mutateAsync: saveRange, isPending: false },
}) }));

import OneCalendar from "./OneCalendar";
(globalThis as { React?: typeof React }).React = React;

afterEach(() => { cleanup(); saveRange.mockClear(); });

describe("rate calendar save", () => {
  it("sends the last night, rather than check-out, as the inclusive end_date", async () => {
    const view = render(<OneCalendar id="hotel-1" />);
    const days = view.container.querySelectorAll<HTMLButtonElement>(".one-calendar-day");
    fireEvent.click(days[28]!);
    fireEvent.click(days[29]!);
    fireEvent.change(screen.getByLabelText("Price per night"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveRange).toHaveBeenCalledWith(expect.objectContaining({
      start_date: "2026-11-29", end_date: "2026-11-29", price: 1200,
    })));
  });
});
