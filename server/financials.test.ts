import { describe, expect, it } from 'vitest';
import { buildFinancialsSummary } from './financials';

describe('financials summary', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('aggregates revenue only for active bookings within the last 30 days', () => {
    const result = buildFinancialsSummary([
      {
        id: 'hotel-1',
        bookings: [
          {
            id: 'booking-active',
            status: 'confirmed',
            check_in: '2026-08-20',
            check_out: '2026-08-22',
            price: '1200',
            rooms: { room_types: { name: 'Deluxe' } },
          },
          {
            id: 'booking-cancelled',
            status: 'cancelled',
            check_in: '2026-08-19',
            check_out: '2026-08-20',
            price: 800,
            rooms: { room_types: { name: 'Deluxe' } },
          },
          {
            id: 'booking-outside-window',
            status: 'confirmed',
            check_in: '2026-07-22',
            check_out: '2026-07-24',
            price: 900,
            rooms: { room_types: { name: 'Standard' } },
          },
        ],
      },
    ], now);

    expect(result.periodStart).toBe('2026-07-23');
    expect(result.periodEnd).toBe('2026-08-21');
    expect(result.totals).toMatchObject({
      revenue: 1200,
      bookings: 1,
      cancelledBookings: 1,
      averageBookingValue: 1200,
      occupancyNights: 2,
      hotelCount: 1,
    });
  });

  it('groups revenue by room type name, falling back to Unassigned when no room is linked', () => {
    const result = buildFinancialsSummary([
      {
        id: 'hotel-1',
        bookings: [
          { id: 'b1', status: 'confirmed', check_in: '2026-08-20', check_out: '2026-08-21', price: 1000, rooms: { room_types: { name: 'Deluxe' } } },
          { id: 'b2', status: 'checked_out', check_in: '2026-08-19', check_out: '2026-08-20', price: 500, rooms: { room_types: { name: 'Deluxe' } } },
          { id: 'b3', status: 'confirmed', check_in: '2026-08-18', check_out: '2026-08-19', price: 300, rooms: null },
        ],
      },
    ], now);

    expect(result.roomTypeBreakdown).toEqual([
      { name: 'Deluxe', bookings: 2, revenue: 1500, averageBookingValue: 750 },
      { name: 'Unassigned', bookings: 1, revenue: 300, averageBookingValue: 300 },
    ]);
  });

  it('creates one daily trend point for every day in the period', () => {
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [{
        id: 'booking-1',
        status: 'checked_out',
        check_in: '2026-08-01',
        check_out: '2026-08-03',
        price: 600,
        rooms: { room_types: { name: 'Standard' } },
      }],
    }], now);

    expect(result.trend).toHaveLength(30);
    expect(result.trend.find(point => point.date === '2026-08-01')).toEqual({ date: '2026-08-01', bookings: 1, revenue: 600 });
  });
});
