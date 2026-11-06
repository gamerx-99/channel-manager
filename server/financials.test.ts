import { describe, expect, it } from 'vitest';
import { buildFinancialsSummary, financialsInputSchema, resolveFinancialsPeriod } from './financials';

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
            price: '1200', payment_status: 'verified', paid_at: '2026-08-20T05:00:00.000Z',
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
          { id: 'b1', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-20T05:00:00Z', check_in: '2026-08-20', check_out: '2026-08-21', price: 1000, rooms: { room_types: { name: 'Deluxe' } } },
          { id: 'b2', status: 'checked_out', payment_status: 'verified', paid_at: '2026-08-19T05:00:00Z', check_in: '2026-08-19', check_out: '2026-08-20', price: 500, rooms: { room_types: { name: 'Deluxe' } } },
          { id: 'b3', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-18T05:00:00Z', check_in: '2026-08-18', check_out: '2026-08-19', price: 300, rooms: null },
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
          { id: 'b1', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-20T05:00:00Z', check_in: '2026-08-20', check_out: '2026-08-21', price: 1000, rooms: null },
          { id: 'b2', status: 'confirmed', payment_status: 'pending', check_in: '2026-08-19', check_out: '2026-08-20', price: 500, rooms: null },
          { id: 'b3', status: 'confirmed', payment_status: 'unpaid', check_in: '2026-08-18', check_out: '2026-08-19', price: 300, rooms: null },
          { id: 'b4', status: 'confirmed', check_in: '2026-08-17', check_out: '2026-08-18', price: 200, rooms: null },
          { id: 'b-cancel', status: 'cancelled', payment_status: 'unpaid', check_in: '2026-08-16', check_out: '2026-08-17', price: 900, rooms: null },
        ],
      },
    ], now);

    expect(result.totals.revenue).toBe(1000);
    expect(result.totals.collectedRevenue).toBe(1000);
    expect(result.totals.pendingRevenue).toBe(0);
    expect(result.totals.outstandingRevenue).toBe(0); // unpaid and pending bookings are not received revenue
  });

  it('does not count held, unpaid, expired, rejected or refunded bookings as revenue (regression: everything except cancelled was revenue)', () => {
    const booking = (id: string, status: string, price: number) => ({ id, status, payment_status: ['confirmed', 'checked_in', 'checked_out'].includes(status) ? 'verified' : 'unpaid', paid_at: ['confirmed', 'checked_in', 'checked_out'].includes(status) ? '2026-08-20T05:00:00Z' : null, check_in: '2026-08-20', check_out: '2026-08-21', price, rooms: null });
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
    expect(result.totals.outstandingRevenue).toBe(0);
    expect(result.trend.find(point => point.date === '2026-08-20')).toEqual({ date: '2026-08-20', bookings: 3, revenue: 6000 });
  });

  it('cuts the 30-day period at Thai midnight, not UTC midnight (regression: figures moved a day between 00:00 and 07:00 in Thailand)', () => {
    const justAfterThaiMidnight = new Date('2026-08-20T17:30:00.000Z'); // 00:30 on 2026-08-21 in Thailand
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [{ id: 'today', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-21T05:00:00Z', check_in: '2026-08-21', check_out: '2026-08-22', price: 700, rooms: null }],
    }], justAfterThaiMidnight);
    expect(result.periodEnd).toBe('2026-08-21');
    expect(result.totals.revenue).toBe(700);
  });

  it('adds money exactly, to the satang', () => {
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [
        { id: 'a', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-20T05:00:00Z', check_in: '2026-08-20', check_out: '2026-08-21', price: '0.10', rooms: null },
        { id: 'b', status: 'confirmed', payment_status: 'verified', paid_at: '2026-08-20T05:00:00Z', check_in: '2026-08-20', check_out: '2026-08-21', price: '0.20', rooms: null },
      ],
    }], now);
    expect(result.totals.revenue).toBe(0.3);
  });

  it('removes a refunded payment from its paid day without subtracting on the refund day', () => {
    const result = buildFinancialsSummary([{ id: 'hotel-1', bookings: [
      { id: 'paid', status: 'refunded', payment_status: 'verified', paid_at: '2026-08-19T17:00:00Z', refunded_at: '2026-08-20T17:00:00Z', check_in: '2026-08-21', check_out: '2026-08-22', price: 700, rooms: null },
    ] }], now, { from: '2026-08-20', to: '2026-08-21' });
    expect(result.totals.revenue).toBe(0);
    expect(result.trend.map(point => point.revenue)).toEqual([0, 0]);
    expect(result.roomTypeBreakdown).toEqual([]);
  });

  it('creates one daily trend point for every day in the period', () => {
    const result = buildFinancialsSummary([{
      id: 'hotel-1',
      bookings: [{
        id: 'booking-1',
        status: 'checked_out',
        payment_status: 'verified', paid_at: '2026-08-01T05:00:00Z',
        check_in: '2026-08-01',
        check_out: '2026-08-03',
        price: 600,
        rooms: { room_types: { name: 'Standard' } },
      }],
    }], now);

    expect(result.trend).toHaveLength(30);
    expect(result.trend.find(point => point.date === '2026-08-01')).toEqual({ date: '2026-08-01', bookings: 1, revenue: 600 });
  });

  describe('chosen period', () => {
    const booking = (id: string, check_in: string, price: number, extra: Record<string, unknown> = {}) => ({
      id, status: 'confirmed', payment_status: 'verified', paid_at: `${check_in}T05:00:00Z`, check_in, check_out: '2027-01-01', price, rooms: { room_types: { name: 'Deluxe' } }, ...extra,
    });
    const hotel = (...bookings: ReturnType<typeof booking>[]) => [{ id: 'hotel-1', bookings }];

    it('no input is the last 30 days, as before', () => {
      const result = buildFinancialsSummary(hotel(booking('a', '2026-08-21', 100)), now);
      expect(result).toMatchObject({ periodStart: '2026-07-23', periodEnd: '2026-08-21', periodLabel: 'last_30_days', trendGranularity: 'day' });
      expect(result.trend).toHaveLength(30);
    });

    it('a month runs from its first to its last Thai day, one trend point per day', () => {
      const result = buildFinancialsSummary(hotel(booking('a', '2026-02-28', 100), booking('b', '2026-03-01', 50)), now, { month: '2026-02' });
      expect(result).toMatchObject({ periodStart: '2026-02-01', periodEnd: '2026-02-28', periodLabel: 'month' });
      expect(result.trend).toHaveLength(28);
      expect(result.totals.revenue).toBe(100);
    });

    it('a booking at 23:59 on the last night belongs to that month, one at 00:00 Thai time on the 1st to the next (check-in is a Thai calendar day)', () => {
      const lateUtc = new Date('2026-09-30T16:59:00.000Z'); // 23:59 on 30 September in Thailand
      const earlyUtc = new Date('2026-09-30T17:00:00.000Z'); // 00:00 on 1 October in Thailand
      const thaiDay = (instant: Date) => new Date(instant.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
      const rows = hotel(booking('late', thaiDay(lateUtc), 100), booking('early', thaiDay(earlyUtc), 200));
      expect(buildFinancialsSummary(rows, now, { month: '2026-09' }).totals.revenue).toBe(100);
      expect(buildFinancialsSummary(rows, now, { month: '2026-10' }).totals.revenue).toBe(200);
    });

    it('a from/to range is inclusive of both days', () => {
      const result = buildFinancialsSummary(hotel(booking('a', '2026-06-01', 10), booking('b', '2026-06-03', 20), booking('c', '2026-06-04', 40)), now, { from: '2026-06-01', to: '2026-06-03' });
      expect(result.periodLabel).toBe('range');
      expect(result.trend.map(point => point.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
      expect(result.totals.revenue).toBe(30);
    });

    it('groups the trend by month above 62 days and keeps the sum equal to the total', () => {
      const result = buildFinancialsSummary(hotel(booking('a', '2026-01-31', 100), booking('b', '2026-02-01', 200), booking('c', '2026-06-15', 300)), now, { from: '2026-01-01', to: '2026-06-30' });
      expect(result.trendGranularity).toBe('month');
      expect(result.trend.map(point => point.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
      expect(result.trend.map(point => point.revenue)).toEqual([100, 200, 0, 0, 0, 300]);
      expect(result.trend.reduce((sum, point) => sum + point.revenue, 0)).toBe(result.totals.revenue);
    });

    it('keeps a daily trend at exactly 62 days and groups at 63', () => {
      expect(buildFinancialsSummary([], now, { from: '2026-01-01', to: '2026-03-03' }).trendGranularity).toBe('day');
      expect(buildFinancialsSummary([], now, { from: '2026-01-01', to: '2026-03-04' }).trendGranularity).toBe('month');
    });

    it('uses the same revenue definition: cancelled bookings only add to the cancelled count', () => {
      const result = buildFinancialsSummary(hotel(booking('a', '2026-05-10', 100), booking('x', '2026-05-11', 900, { status: 'cancelled', payment_status: 'unpaid', paid_at: null }), booking('h', '2026-05-12', 900, { status: 'held', payment_status: 'unpaid', paid_at: null })), now, { month: '2026-05' });
      expect(result.totals).toMatchObject({ revenue: 100, bookings: 1, cancelledBookings: 1 });
      expect(result.bookings.map(row => row.status)).toEqual(['confirmed']);
    });

    it('lists one row per revenue booking with a shortened id, nullable payment method, and no guest data', () => {
      const guest = { guest_name: 'Somchai Jaidee', guest_email: 'somchai@example.test', guest_phone: '0812345678', guest_id_number: '1234567890123' };
      const result = buildFinancialsSummary(hotel(
        booking('0123456789abcdef', '2026-08-20', 1200.5, { source: 'direct', payment_status: 'verified', payment_method: 'promptpay', ...guest }),
        booking('fedcba9876543210', '2026-08-19', 800, { source: 'manual', ...guest }),
      ), now);
      expect(result.bookings).toEqual([
        { id: 'fedcba98', paid_at: '2026-08-19', check_in: '2026-08-19', check_out: '2027-01-01', room_type: 'Deluxe', source: 'manual', status: 'confirmed', payment_status: 'verified', payment_method: null, price: 800 },
        { id: '01234567', paid_at: '2026-08-20', check_in: '2026-08-20', check_out: '2027-01-01', room_type: 'Deluxe', source: 'direct', status: 'confirmed', payment_status: 'verified', payment_method: 'promptpay', price: 1200.5 },
      ]);
      const text = JSON.stringify(result);
      for (const secret of ['Somchai', 'somchai@example.test', '0812345678', '1234567890123', '0123456789abcdef']) expect(text).not.toContain(secret);
    });
  });

  describe('period input', () => {
    const parse = (value: unknown) => financialsInputSchema.safeParse(value);
    it('accepts no input, a month, and a range', () => {
      expect(parse(undefined).success).toBe(true);
      expect(parse({ month: '2026-02' }).success).toBe(true);
      expect(parse({ from: '2026-01-01', to: '2027-01-01' }).success).toBe(true); // 366 days counting both ends
      expect(parse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(true); // 366 days, leap year
    });
    it('rejects bad months, bad dates, a reversed range, more than 366 days, and mixed or extra fields', () => {
      for (const bad of [
        { month: '2026-13' }, { month: '2026-1' }, { month: '2026-00' }, { month: 'last' },
        { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-3-1', to: '2026-03-02' },
        { from: '2026-06-02', to: '2026-06-01' },
        { month: '2026-02', from: '2026-02-01', to: '2026-02-28' }, { from: '2026-02-01' }, {},
      ]) {
        expect(parse(bad).success, JSON.stringify(bad)).toBe(false);
      }
      expect(parse({ from: '2026-01-01', to: '2027-01-02' }).success).toBe(false); // 367 days
    });
    it('resolveFinancialsPeriod throws on an invalid input instead of guessing', () => {
      expect(() => resolveFinancialsPeriod({ from: '2026-06-02', to: '2026-06-01' })).toThrow();
    });
  });
});
