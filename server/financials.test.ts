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


  it('correctly categorizes collected, pending, and outstanding revenue based on payment_status', () => {
    const result = buildFinancialsSummary([
      {
        id: 'hotel-1',
        bookings: [
          { id: 'b1', status: 'confirmed', payment_status: 'verified', check_in: '2026-08-20', check_out: '2026-08-21', price: 1000, rooms: null },
          { id: 'b2', status: 'confirmed', payment_status: 'pending', check_in: '2026-08-19', check_out: '2026-08-20', price: 500, rooms: null },
          { id: 'b3', status: 'confirmed', payment_status: 'unpaid', check_in: '2026-08-18', check_out: '2026-08-19', price: 300, rooms: null },
          { id: 'b4', status: 'confirmed', check_in: '2026-08-17', check_out: '2026-08-18', price: 200, rooms: null },
          { id: 'b-cancel', status: 'cancelled', payment_status: 'unpaid', check_in: '2026-08-16', check_out: '2026-08-17', price: 900, rooms: null },
        ],
      },
    ], now);

    expect(result.totals.revenue).toBe(2000);
    expect(result.totals.collectedRevenue).toBe(1000);
    expect(result.totals.pendingRevenue).toBe(500);
    expect(result.totals.outstandingRevenue).toBe(500); // 300 unpaid + 200 undefined
  });

  it('does not count held, unpaid, expired, rejected or refunded bookings as revenue (regression: everything except cancelled was revenue)', () => {
    const booking = (id: string, status: string, price: number) => ({ id, status, payment_status: 'unpaid', check_in: '2026-08-20', check_out: '2026-08-21', price, rooms: null });
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [
        booking('ok-confirmed', 'confirmed', 1000),
        booking('ok-in', 'checked_in', 2000),
        booking('ok-out', 'checked_out', 3000),
        booking('held', 'held', 400),
        booking('pay', 'pending_payment', 400),
        booking('verify', 'pending_verification', 400),
        booking('expired', 'expired', 400),
        booking('rejected', 'payment_rejected', 400),
        booking('cancelled', 'cancelled', 400),
        booking('refund-pending', 'refund_pending', 400),
        booking('refunded', 'refunded', 400),
      ],
    }], now);
    expect(result.totals.revenue).toBe(6000);
    expect(result.totals.bookings).toBe(3);
    expect(result.totals.cancelledBookings).toBe(3); // cancelled + refund pending + refunded
    expect(result.totals.outstandingRevenue).toBe(6000);
    expect(result.trend.find(point => point.date === '2026-08-20')).toEqual({ date: '2026-08-20', bookings: 3, revenue: 6000 });
  });

  it('cuts the 30-day period at Thai midnight, not UTC midnight (regression: figures moved a day between 00:00 and 07:00 in Thailand)', () => {
    const justAfterThaiMidnight = new Date('2026-08-20T17:30:00.000Z'); // 00:30 on 2026-08-21 in Thailand
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [{ id: 'today', status: 'confirmed', check_in: '2026-08-21', check_out: '2026-08-22', price: 700, rooms: null }],
    }], justAfterThaiMidnight);
    expect(result.periodEnd).toBe('2026-08-21');
    expect(result.totals.revenue).toBe(700);
  });

  it('adds money exactly, to the satang', () => {
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [
        { id: 'a', status: 'confirmed', check_in: '2026-08-20', check_out: '2026-08-21', price: '0.10', rooms: null },
        { id: 'b', status: 'confirmed', check_in: '2026-08-20', check_out: '2026-08-21', price: '0.20', rooms: null },
      ],
    }], now);
    expect(result.totals.revenue).toBe(0.3);
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
