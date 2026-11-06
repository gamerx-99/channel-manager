import type { FinancialsBookingRow } from "@/../../server/financials";

/** What the owner picked: the rolling last 30 days, or one Thai calendar month (YYYY-MM). */
export type FinancialsChoice = { kind: "last30" } | { kind: "month"; month: string };

/** The query input for the chosen period. The last 30 days sends no input, exactly as before. */
export function financialsQueryInput(choice: FinancialsChoice): { month: string } | undefined {
  return choice.kind === "month" ? { month: choice.month } : undefined;
}

/** Move a YYYY-MM month forward or back by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const BOOKINGS_CSV_HEADERS = ["Booking ID", "Paid date", "Check-in", "Check-out", "Room type", "Source", "Status", "Payment status", "Payment method", "Price"];

/** A cell the spreadsheet could read as a formula is prefixed with an apostrophe. */
function textCell(value: string | null | undefined) {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** One row per booking, money as a plain number with 2 decimals. No BOM here; the download adds it. */
export function bookingsCsv(rows: readonly FinancialsBookingRow[]): string {
  return [
    BOOKINGS_CSV_HEADERS.map(textCell).join(","),
    ...rows.map(row => [
      textCell(row.id), textCell(row.paid_at), textCell(row.check_in), textCell(row.check_out), textCell(row.room_type), textCell(row.source),
      textCell(row.status), textCell(row.payment_status), textCell(row.payment_method), row.price.toFixed(2),
    ].join(",")),
  ].join("\n");
}

/** UTF-8 byte order mark so Excel opens Thai text correctly. */
export const CSV_BOM = "﻿";
