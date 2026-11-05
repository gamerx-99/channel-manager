// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BookingWizard from "./BookingWizard";
import { nightsForDisplay, parseStopSellNights } from "./bookingWizardStopSell";

const mutate = vi.fn();
let options: { onError?: (error: { message: string }) => void } = {};
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: { createBooking: { useMutation: (opts: typeof options) => { options = opts; return { mutate, isPending: false }; } } } } }));
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); mutate.mockClear(); });

describe("stop sell helpers", () => {
  it("reads the nights from a STOP_SELL message and ignores other errors", () => {
    expect(parseStopSellNights("STOP_SELL: closed to online guests on 2026-11-01, 2026-11-02.")).toEqual(["2026-11-01", "2026-11-02"]);
    expect(parseStopSellNights("The selected room type is no longer available")).toBeNull();
    expect(nightsForDisplay(["2026-11-01", "2026-11-02"])).toBe("01/11/2026, 02/11/2026");
  });
});

describe("booking wizard on a closed night", () => {
  it("shows the notice, then resubmits with override_stop_sell on confirm", () => {
    const hotel = { id: "h", rooms: [{ id: "r", room_number: "101", room_type_id: "t", status: "available" }], room_types: [{ id: "t", name: "Deluxe", base_price: 1000 }], bookings: [] };
    render(<BookingWizard hotel={hotel} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const roomSelect = Array.from(document.querySelectorAll("select")).find(select => select.querySelector('option[value="r"]'))!;
    fireEvent.change(roomSelect, { target: { value: "r" } });
    fireEvent.change(screen.getByLabelText("ชื่อผู้เข้าพักหลัก"), { target: { value: "Somchai" } });
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันและบันทึก" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0].override_stop_sell).toBeUndefined();

    React.act(() => options.onError!({ message: "STOP_SELL: closed to online guests on 2026-11-02." }));
    expect(screen.getByRole("alert").textContent).toContain("02/11/2026");
    fireEvent.click(screen.getByRole("button", { name: "จองต่อ" }));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0].override_stop_sell).toBe(true);
  });
});
