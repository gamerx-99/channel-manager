// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodPicker } from "./Financials";
import { CSV_BOM, bookingsCsv, financialsQueryInput, shiftMonth } from "./financialsPeriod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/contexts/HotelContext", () => ({ useHotel: () => ({ hotels: [], selectedHotelId: null }) }));
vi.mock("@/lib/mfa", () => ({ useMfaStepUp: () => ({}) }));
(globalThis as { React?: typeof React }).React = React;

afterEach(cleanup);

describe("PeriodPicker", () => {
  it("offers last 30 days, previous, next and this month, and reports each choice", () => {
    const onChange = vi.fn();
    render(<PeriodPicker choice={{ kind: "month", month: "2026-10" }} onChange={onChange} locale="en-GB" currentMonth="2026-11" />);
    expect(screen.getByText("October 2026")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "month", month: "2026-09" });
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "month", month: "2026-11" });
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "month", month: "2026-11" });
    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "last30" });
  });

  it("does not move past the current month", () => {
    render(<PeriodPicker choice={{ kind: "month", month: "2026-11" }} onChange={vi.fn()} locale="en-GB" currentMonth="2026-11" />);
    expect((screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "This month" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("marks last 30 days as chosen by default", () => {
    render(<PeriodPicker choice={{ kind: "last30" }} onChange={vi.fn()} locale="en-GB" currentMonth="2026-11" />);
    expect(screen.getByRole("button", { name: "Last 30 days" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("period helpers", () => {
  it("sends no input for the last 30 days and the month otherwise", () => {
    expect(financialsQueryInput({ kind: "last30" })).toBeUndefined();
    expect(financialsQueryInput({ kind: "month", month: "2026-02" })).toEqual({ month: "2026-02" });
  });

  it("moves months across year ends", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-05", 0)).toBe("2026-05");
  });
});

describe("bookings CSV", () => {
  const row = { id: "01234567", paid_at: "2026-08-19", check_in: "2026-08-20", check_out: "2026-08-22", room_type: "ห้องดีลักซ์", source: "direct", status: "confirmed", payment_status: "verified", payment_method: "promptpay", price: 1200.5 };

  it("has a header row, plain numbers with 2 decimals, and keeps Thai text", () => {
    const lines = bookingsCsv([row, { ...row, id: "89abcdef", payment_status: null, payment_method: null, price: 800 }]).split("\n");
    expect(lines[0]).toBe('"Booking ID","Paid date","Check-in","Check-out","Room type","Source","Status","Payment status","Payment method","Price"');
    expect(lines[1]).toBe('"01234567","2026-08-19","2026-08-20","2026-08-22","ห้องดีลักซ์","direct","confirmed","verified","promptpay",1200.50');
    expect(lines[2]).toBe('"89abcdef","2026-08-19","2026-08-20","2026-08-22","ห้องดีลักซ์","direct","confirmed","","",800.00');
  });

  it("is only a header when there are no bookings, and the download adds a UTF-8 byte order mark", () => {
    expect(bookingsCsv([]).split("\n")).toHaveLength(1);
    expect(CSV_BOM).toBe("﻿");
  });

  it("neutralises cells a spreadsheet would run as a formula and doubles quotes", () => {
    const line = bookingsCsv([{ ...row, room_type: '=HYPERLINK("x")' }]).split("\n")[1];
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("Financials payment settings move", () => {
  it("removes the old form and shows the edit-only hotel settings link", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/Financials.tsx"), "utf8");
    expect(page).not.toContain("promptpay-id-input");
    expect(page).not.toContain("promptpay-timeout");
    expect(page).toContain("canManagePaymentSettings");
    expect(page).toContain("/hotels/${hotelId}");
  });
});
