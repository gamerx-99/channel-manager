import { describe, expect, it } from 'vitest';
import { buildBookingsReport, type ReportBooking } from './bookingsReport';

const base: ReportBooking = { id: '12345678-aaaa', guestName: 'Guest', roomType: 'Standard', checkIn: '2026-11-01', checkOut: '2026-11-04', createdAt: '2026-10-20T10:00:00Z', status: 'confirmed', source: 'manual', price: '3000', roomRevenue: '3000' };
const period = { from: '2026-11-02', to: '2026-11-03' };
const run = (bookings: ReportBooking[], basis: 'stay' | 'created' = 'stay', sellableRooms = 2) => buildBookingsReport({ bookings, basis, sellableRooms, period });

describe('bookings report aggregation', () => {
  it('counts standing bookings and excludes cancelled, refunded, rejected and expired ones from sold nights and revenue', () => {
    const bookings = [base, ...['cancelled', 'refund_pending', 'refunded', 'payment_rejected', 'expired'].map((status, index) => ({ ...base, id: `cancel-${index}`, status }))];
    const result = run(bookings);
    expect(result.totals).toMatchObject({ bookings: 1, roomNights: 2, cancelledBookings: 3, occupancy: 50, adr: 1000 });
    expect(result.roomTypes).toMatchObject([{ bookings: 1, nights: 2, revenue: 2000, share: 100 }]);
    expect(result.daily.map(day => day.nights)).toEqual([1, 1]);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.filter(row => row.status !== 'confirmed').every(row => row.amount === 0)).toBe(true);
  });
  it('clips nights and room revenue at both period edges', () => {
    const result = run([{ ...base, checkIn: '2026-10-31', checkOut: '2026-11-03', price: '3000' }, { ...base, id: 'later', checkIn: '2026-11-03', checkOut: '2026-11-06', price: '3000' }]);
    expect(result.totals.roomNights).toBe(2);
    expect(result.daily.map(day => day.nights)).toEqual([1, 1]);
    expect(result.roomTypes[0].revenue).toBe(2000);
  });
  it('uses zero occupancy with no rooms and zero ADR with no standing nights', () => {
    expect(run([base], 'stay', 0).totals.occupancy).toBe(0);
    expect(run([{ ...base, status: 'cancelled' }]).totals.adr).toBe(0);
  });
  it('selects the booking cohort by Thai created date when toggled', () => {
    const bookedOnNov2 = { ...base, createdAt: '2026-11-01T18:00:00Z', checkIn: '2026-12-01', checkOut: '2026-12-04' };
    const result = run([base, bookedOnNov2], 'created');
    expect(result.totals).toMatchObject({ bookings: 1, roomNights: 3, adr: 1000 });
    expect(result.daily.map(day => day.nights)).toEqual([3, 0]);
    expect(result.rows).toHaveLength(1);
  });
  it('excludes services from ADR and room revenue while showing the booking amount in the table', () => {
    const result = run([{ ...base, price: '3600', roomRevenue: '3000' }]);
    expect(result.totals.adr).toBe(1000);
    expect(result.roomTypes[0].revenue).toBe(2000);
    expect(result.rows[0].amount).toBe(3600);
  });
  it('omits every money key in the count-only variant', () => {
    const result = buildBookingsReport({ bookings: [base], basis: 'stay', sellableRooms: 2, period, includeMoney: false });
    expect(result.totals).toMatchObject({ bookings: 1, roomNights: 2, occupancy: 50 });
    expect(result.totals).not.toHaveProperty('adr');
    for (const row of [...result.roomTypes, ...result.sources]) {
      expect(row).not.toHaveProperty('revenue');
      expect(row).not.toHaveProperty('share');
    }
    expect(result.rows[0]).not.toHaveProperty('amount');
    expect(JSON.stringify(result)).not.toMatch(/"(?:adr|revenue|share|amount)":/);
  });
});
