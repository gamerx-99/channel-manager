/**
 * One definition of "revenue", "today" and the dashboard money and arrival figures, shared by the
 * server (financial report) and the client (dashboard), so the two can never disagree.
 *
 * Revenue is the value of bookings the hotel can count on: confirmed, checked in or checked out.
 * It is booked by the check-in date, in Thailand time (the hotel's day, not the server's UTC day).
 * Held, awaiting payment, awaiting verification, expired, rejected, cancelled and refunded bookings
 * are not revenue.
 */
export const REVENUE_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;
/** A booking that was cancelled, including one whose money is being or has been given back. */
export const CANCELLED_STATUSES = ["cancelled", "refund_pending", "refunded"] as const;

export function isRevenueStatus(status: string): boolean {
  return (REVENUE_STATUSES as readonly string[]).includes(status);
}

export function isCancelledStatus(status: string): boolean {
  return (CANCELLED_STATUSES as readonly string[]).includes(status);
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // Thailand has no daylight saving time.

/** The calendar date (YYYY-MM-DD) in Thailand at this moment. */
export function bangkokDate(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** The calendar month (YYYY-MM) in Thailand at this moment. */
export function bangkokMonth(now: Date = new Date()): string {
  return bangkokDate(now).slice(0, 7);
}

/** Money in whole satang, so sums have no floating-point drift. Anything unreadable counts as 0. */
export function toSatang(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function fromSatang(satang: number): number {
  return satang / 100;
}

export type FigureBooking = { status: string; check_in: string; check_out: string; price?: string | number | null };

export type DashboardFigures = {
  /** Guests due today, including those already checked in. */
  arrivalsToday: number;
  /** Guests leaving today, including those already checked out. */
  departuresToday: number;
  revenueToday: number;
  revenueThisMonth: number;
};

export function dashboardFigures(bookings: readonly FigureBooking[], now: Date = new Date()): DashboardFigures {
  const today = bangkokDate(now);
  const month = bangkokMonth(now);
  const counted = bookings.filter(booking => isRevenueStatus(booking.status));
  const sum = (rows: readonly FigureBooking[]) => fromSatang(rows.reduce((total, booking) => total + toSatang(booking.price), 0));
  return {
    arrivalsToday: counted.filter(booking => booking.check_in === today).length,
    departuresToday: counted.filter(booking => booking.check_out === today).length,
    revenueToday: sum(counted.filter(booking => booking.check_in === today)),
    revenueThisMonth: sum(counted.filter(booking => booking.check_in.startsWith(month))),
  };
}
