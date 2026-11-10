/**
 * One definition of "revenue", "today" and the dashboard money and arrival figures, shared by the
 * server (financial report) and the client (dashboard), so the two can never disagree.
 *
 * Revenue includes paid bookings that still stand, on their Thai payment day. Cancelled,
 * refund-pending, refunded, rejected and expired bookings contribute nothing.
 * Confirmed, checked-in and checked-out bookings with no paid timestamp are not collected revenue.
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

export type RevenueEvent = { status: string; amount: string | number | null | undefined; paidAt?: string | Date | null };

/** Revenue from bookings that still stand, on each Thai calendar day they were paid. */
export function revenueByThaiDay(events: readonly RevenueEvent[]): Map<string, number> {
  const satangByDay = new Map<string, number>();
  const add = (instant: string | Date | null | undefined, amount: number) => {
    if (!instant) return;
    const date = bangkokDate(instant instanceof Date ? instant : new Date(instant));
    satangByDay.set(date, (satangByDay.get(date) ?? 0) + amount);
  };
  for (const event of events) {
    if (!isRevenueStatus(event.status)) continue;
    add(event.paidAt, toSatang(event.amount));
  }
  return new Map(Array.from(satangByDay.entries(), ([date, satang]) => [date, fromSatang(satang)]));
}

export function fromSatang(satang: number): number {
  return satang / 100;
}

export type FigureBooking = { status: string; payment_status?: string | null; check_in: string; check_out: string; paid_at?: string | null; refunded_at?: string | null; price?: string | number | null };

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
  const active = bookings.filter(booking => isRevenueStatus(booking.status));
  const counted = bookings.filter(booking => booking.payment_status === "verified" && booking.paid_at);
  const dayRevenue = revenueByThaiDay(counted.map(booking => ({ status: booking.status, amount: booking.price, paidAt: booking.paid_at })));
  return {
    arrivalsToday: active.filter(booking => booking.check_in === today).length,
    departuresToday: active.filter(booking => booking.check_out === today).length,
    revenueToday: dayRevenue.get(today) ?? 0,
    revenueThisMonth: Array.from(dayRevenue.entries()).filter(([date]) => date.startsWith(month)).reduce((sum, [, amount]) => sum + amount, 0),
  };
}
