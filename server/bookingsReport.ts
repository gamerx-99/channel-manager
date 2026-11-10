import { bangkokDate, fromSatang, isCancelledStatus, isRevenueStatus, toSatang } from '@shared/finance';
import { resolveFinancialsPeriod, type FinancialsPeriodInput } from './financials';

export type ReportBooking = {
  id: string; guestName: string; roomType: string; checkIn: string; checkOut: string;
  createdAt: string; status: string; source: string; price: string | number; roomRevenue: string | number;
};
export type BookingsReportInput = { bookings: readonly ReportBooking[]; sellableRooms: number; period?: FinancialsPeriodInput; basis: 'stay' | 'created'; now?: Date; includeMoney?: boolean };
export type ReportBreakdown = { name: string; bookings: number; nights: number; revenue?: number; share?: number };

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00.000Z`) / DAY;
const dateAt = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/** A booking cohort has full stay nights; a stay period has only nights within its edges. */
export function buildBookingsReport({ bookings, sellableRooms, period, basis, now = new Date(), includeMoney = true }: BookingsReportInput) {
  const { start, end } = resolveFinancialsPeriod(period ?? { month: bangkokDate(now).slice(0, 7) }, now);
  const first = dayNumber(start);
  const last = dayNumber(end);
  const days = last - first + 1;
  const selected = bookings.map(booking => {
    const checkIn = dayNumber(booking.checkIn);
    const checkOut = dayNumber(booking.checkOut);
    const createdDay = bangkokDate(new Date(booking.createdAt));
    const fullNights = Math.max(0, checkOut - checkIn);
    const nights = basis === 'created' ? fullNights : Math.max(0, Math.min(checkOut, last + 1) - Math.max(checkIn, first));
    const included = basis === 'created' ? createdDay >= start && createdDay <= end : nights > 0;
    const revenue = includeMoney && fullNights > 0 ? Math.round(toSatang(booking.roomRevenue) * nights / fullNights) : 0;
    return { booking, checkIn, checkOut, createdDay, fullNights, nights, included, revenue };
  }).filter(item => item.included);
  const standing = selected.filter(item => isRevenueStatus(item.booking.status));
  const roomNights = standing.reduce((sum, item) => sum + item.nights, 0);
  const revenueSatang = standing.reduce((sum, item) => sum + item.revenue, 0);
  const breakdown = (key: (item: typeof standing[number]) => string): ReportBreakdown[] => {
    const groups = new Map<string, { bookings: number; nights: number; revenue: number }>();
    for (const item of standing) {
      const name = key(item);
      const group = groups.get(name) ?? { bookings: 0, nights: 0, revenue: 0 };
      group.bookings++;
      group.nights += item.nights;
      group.revenue += item.revenue;
      groups.set(name, group);
    }
    return Array.from(groups, ([name, group]) => ({ name, bookings: group.bookings, nights: group.nights,
      ...(includeMoney ? { revenue: fromSatang(group.revenue), share: revenueSatang ? group.revenue / revenueSatang * 100 : 0 } : {}) }))
      .sort((a, b) => includeMoney ? (b.revenue ?? 0) - (a.revenue ?? 0) || a.name.localeCompare(b.name) : b.bookings - a.bookings || a.name.localeCompare(b.name));
  };
  const statusCounts = new Map<string, number>();
  for (const item of selected) statusCounts.set(item.booking.status, (statusCounts.get(item.booking.status) ?? 0) + 1);
  const daily = Array.from({ length: days }, (_, index) => {
    const day = first + index;
    // ASSUMPTION: in created-date mode, all nights sold by a booking belong to its created day.
    const nights = standing.reduce((sum, item) => sum + (basis === 'created' ? (item.createdDay === dateAt(day) ? item.nights : 0) : (item.checkIn <= day && item.checkOut > day ? 1 : 0)), 0);
    return { date: dateAt(day), nights };
  });
  return {
    periodStart: start, periodEnd: end, basis,
    totals: {
      bookings: standing.length, roomNights,
      occupancy: sellableRooms > 0 && days > 0 ? roomNights / (sellableRooms * days) * 100 : 0,
      ...(includeMoney ? { adr: roomNights ? fromSatang(revenueSatang) / roomNights : 0 } : {}),
      cancelledBookings: selected.filter(item => isCancelledStatus(item.booking.status)).length,
      averageStay: standing.length ? standing.reduce((sum, item) => sum + item.fullNights, 0) / standing.length : 0,
      averageLead: standing.length ? standing.reduce((sum, item) => sum + Math.max(0, item.checkIn - dayNumber(item.createdDay)), 0) / standing.length : 0,
    },
    roomTypes: breakdown(item => item.booking.roomType),
    sources: breakdown(item => item.booking.source),
    statuses: Array.from(statusCounts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    daily,
    rows: selected.map(item => ({ id: item.booking.id.slice(0, 8), guestName: item.booking.guestName, roomType: item.booking.roomType,
      checkIn: item.booking.checkIn, checkOut: item.booking.checkOut, nights: item.nights, status: item.booking.status,
      // ASSUMPTION: owners see the full booking amount; cancelled rows show zero so they cannot be read as revenue.
      ...(includeMoney ? { amount: isRevenueStatus(item.booking.status) ? fromSatang(toSatang(item.booking.price)) : 0 } : {}) })).sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.id.localeCompare(b.id)),
  };
}
