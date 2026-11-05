import { z } from 'zod';
import { bangkokDate, fromSatang, isCancelledStatus, isRevenueStatus, toSatang } from '@shared/finance';

type BookingRecord = { id: string; status: string; check_in: string; check_out: string; price: string | null; [key: string]: any };

type BookingRow = Pick<BookingRecord, 'id' | 'status' | 'check_in' | 'check_out' | 'price'> & {
  payment_status?: string | null;
  payment_method?: string | null;
  source?: string | null;
  rooms: { room_types: { name: string } | null } | null;
};

type HotelWithBookings = {
  id: string;
  bookings: BookingRow[];
};

export type FinancialsTrendPoint = {
  date: string;
  bookings: number;
  revenue: number;
};

export type FinancialsRoomTypeBreakdown = {
  name: string;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
};

export type FinancialsResult = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: 'last_30_days' | 'month' | 'range';
  /** 'day' = one trend point per day; 'month' = one per Thai calendar month (periods over 62 days). */
  trendGranularity: 'day' | 'month';
  totals: {
    revenue: number;
    bookings: number;
    cancelledBookings: number;
    averageBookingValue: number;
    occupancyNights: number;
    hotelCount: number;
    collectedRevenue: number;
    outstandingRevenue: number;
    pendingRevenue: number;
  };
  trend: FinancialsTrendPoint[];
  roomTypeBreakdown: FinancialsRoomTypeBreakdown[];
  /** One row per revenue booking in the period. No guest names or contact data, ever. */
  bookings: FinancialsBookingRow[];
};

export type FinancialsBookingRow = {
  /** First 8 characters of the booking id only. */
  id: string;
  check_in: string;
  check_out: string;
  room_type: string;
  source: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  price: number;
};

export const MAX_PERIOD_DAYS = 366;
/** Above this many days the trend is grouped by month instead of by day. */
export const MAX_DAILY_TREND_DAYS = 62;

export type FinancialsPeriodInput = { month: string } | { from: string; to: string } | undefined;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

/** Returns a plain-language reason the input is not allowed, or null when it is fine. */
export function financialsPeriodError(input: NonNullable<FinancialsPeriodInput>): string | null {
  if ('month' in input) return MONTH_PATTERN.test(input.month) ? null : 'Use a month as YYYY-MM.';
  if (!isRealDate(input.from) || !isRealDate(input.to)) return 'Use calendar dates as YYYY-MM-DD.';
  if (input.to < input.from) return 'The end date must not be before the start date.';
  if (daysBetween(input.from, input.to) + 1 > MAX_PERIOD_DAYS) return `The period can be at most ${MAX_PERIOD_DAYS} days.`;
  return null;
}

/** Dates are Thai calendar days. No input = the last 30 days, ending today in Thailand. */
export const financialsInputSchema = z.union([
  z.object({ month: z.string() }).strict(),
  z.object({ from: z.string(), to: z.string() }).strict(),
]).optional().superRefine((input, ctx) => {
  if (!input) return;
  const error = financialsPeriodError(input);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
});

export function resolveFinancialsPeriod(input: FinancialsPeriodInput, now: Date = new Date()) {
  if (!input) {
    const end = bangkokDate(now);
    return { start: addDays(end, -29), end, label: 'last_30_days' as const };
  }
  const error = financialsPeriodError(input);
  if (error) throw new Error(error);
  if ('month' in input) return { start: `${input.month}-01`, end: lastDayOfMonth(input.month), label: 'month' as const };
  return { start: input.from, end: input.to, label: 'range' as const };
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

function overlapNights(checkIn: string, checkOut: string, periodStart: string, periodEndExclusive: string) {
  const start = Math.max(Date.parse(`${checkIn}T00:00:00.000Z`), Date.parse(`${periodStart}T00:00:00.000Z`));
  const end = Math.min(Date.parse(`${checkOut}T00:00:00.000Z`), Date.parse(`${periodEndExclusive}T00:00:00.000Z`));
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * Revenue here is the value of confirmed, checked-in and checked-out bookings, booked by check-in date
 * in Thailand time (see `shared/finance.ts`). Held, awaiting-payment, expired, rejected, cancelled and
 * refunded bookings are not revenue. Collected / pending / outstanding split that revenue by payment status.
 */
export function buildFinancialsSummary(hotels: HotelWithBookings[], now = new Date(), periodInput?: FinancialsPeriodInput): FinancialsResult {
  const generatedAt = now.toISOString();
  const { start: periodStart, end: periodEnd, label: periodLabel } = resolveFinancialsPeriod(periodInput, now);
  const periodEndExclusive = addDays(periodEnd, 1);

  const allBookings = hotels.flatMap(hotel => hotel.bookings);
  const periodBookings = allBookings.filter(booking => booking.check_in >= periodStart && booking.check_in <= periodEnd);
  const revenueBookings = periodBookings.filter(booking => isRevenueStatus(booking.status));
  const cancelledBookings = periodBookings.filter(booking => isCancelledStatus(booking.status));
  const revenueSatang = revenueBookings.reduce((total, booking) => total + toSatang(booking.price), 0);
  let collectedSatang = 0;
  let outstandingSatang = 0;
  let pendingSatang = 0;
  for (const booking of revenueBookings) {
    const amount = toSatang(booking.price);
    if (booking.payment_status === "verified") {
      collectedSatang += amount;
    } else if (booking.payment_status === "pending") {
      pendingSatang += amount;
    } else {
      outstandingSatang += amount;
    }
  }
  const revenue = fromSatang(revenueSatang);

  const dayCount = daysBetween(periodStart, periodEnd) + 1;
  const trendGranularity = dayCount > MAX_DAILY_TREND_DAYS ? 'month' : 'day';
  const sumRevenue = (rows: BookingRow[]) => fromSatang(rows.reduce((total, booking) => total + toSatang(booking.price), 0));
  let trend: FinancialsTrendPoint[];
  if (trendGranularity === 'day') {
    trend = Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(periodStart, index);
      const dayBookings = revenueBookings.filter(booking => booking.check_in === date);
      return { date, bookings: dayBookings.length, revenue: sumRevenue(dayBookings) };
    });
  } else {
    // One point per Thai calendar month, dated the first of the month.
    trend = [];
    for (let month = periodStart.slice(0, 7); month <= periodEnd.slice(0, 7); month = addDays(lastDayOfMonth(month), 1).slice(0, 7)) {
      const monthBookings = revenueBookings.filter(booking => booking.check_in.startsWith(month));
      trend.push({ date: `${month}-01`, bookings: monthBookings.length, revenue: sumRevenue(monthBookings) });
    }
  }

  const bookingRows: FinancialsBookingRow[] = revenueBookings
    .map(booking => ({
      id: booking.id.slice(0, 8),
      check_in: booking.check_in,
      check_out: booking.check_out,
      room_type: booking.rooms?.room_types?.name ?? 'Unassigned',
      source: booking.source ?? '',
      status: booking.status,
      payment_status: booking.payment_status ?? null,
      payment_method: booking.payment_method ?? null,
      price: fromSatang(toSatang(booking.price)),
    }))
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.id.localeCompare(b.id));

  const roomTypeTotals = new Map<string, { bookings: number; satang: number }>();
  for (const booking of revenueBookings) {
    const name = booking.rooms?.room_types?.name ?? 'Unassigned';
    const entry = roomTypeTotals.get(name) ?? { bookings: 0, satang: 0 };
    entry.bookings += 1;
    entry.satang += toSatang(booking.price);
    roomTypeTotals.set(name, entry);
  }
  const roomTypeBreakdown: FinancialsRoomTypeBreakdown[] = Array.from(roomTypeTotals.entries())
    .map(([name, entry]) => ({
      name,
      bookings: entry.bookings,
      revenue: fromSatang(entry.satang),
      averageBookingValue: entry.bookings ? fromSatang(entry.satang) / entry.bookings : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    generatedAt,
    periodStart,
    periodEnd,
    periodLabel,
    trendGranularity,
    totals: {
      revenue,
      bookings: revenueBookings.length,
      cancelledBookings: cancelledBookings.length,
      averageBookingValue: revenueBookings.length ? revenue / revenueBookings.length : 0,
      occupancyNights: revenueBookings.reduce(
        (total, booking) => total + overlapNights(booking.check_in, booking.check_out, periodStart, periodEndExclusive),
        0,
      ),
      hotelCount: hotels.length,
      collectedRevenue: fromSatang(collectedSatang),
      outstandingRevenue: fromSatang(outstandingSatang),
      pendingRevenue: fromSatang(pendingSatang),
    },
    trend,
    roomTypeBreakdown,
    bookings: bookingRows,
  };
}