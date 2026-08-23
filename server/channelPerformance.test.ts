import { describe, expect, it } from 'vitest';
import { buildChannelPerformanceSummary } from './channelPerformance';

describe('channel performance summary', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('aggregates only the supplied property-scoped bookings within the last 30 days', () => {
    const result = buildChannelPerformanceSummary([
      {
        id: 'hotel-visible',
        bookings: [
          {
            id: 'booking-manual',
            source: 'manual',
            status: 'confirmed',
            check_in: '2026-08-20',
            check_out: '2026-08-22',
            price: '1200',
          },
          {
            id: 'booking-cancelled',
            source: 'walk-in',
            status: 'cancelled',
            check_in: '2026-08-19',
            check_out: '2026-08-20',
            price: 800,
          },
          {
            id: 'booking-outside-window',
            source: 'phone',
            status: 'confirmed',
            check_in: '2026-07-22',
            check_out: '2026-07-24',
            price: 900,
          },
        ],
      },
      {
        id: 'hotel-hidden-from-this-call',
        bookings: [{
          id: 'booking-hidden',
          source: 'phone',
          status: 'confirmed',
          check_in: '2026-08-20',
          check_out: '2026-08-21',
          price: 9999,
        }],
      },
    ].slice(0, 1), [], now);

    expect(result.periodStart).toBe('2026-07-23');
    expect(result.periodEnd).toBe('2026-08-21');
    expect(result.totals).toMatchObject({
      bookings: 1,
      confirmedBookings: 1,
      cancelledBookings: 1,
      revenue: 1200,
      occupancyNights: 2,
      hotelCount: 1,
    });
    expect(result.channels.find(channel => channel.id === 'booking:manual')).toMatchObject({
      bookings: 1,
      revenue: 1200,
      occupancyNights: 2,
      hotelCount: 1,
    });
    expect(result.channels.find(channel => channel.id === 'booking:phone')).toMatchObject({ bookings: 0, revenue: 0 });
  });

  it('summarizes OTA calendars as sync health without inventing booking revenue', () => {
    const result = buildChannelPerformanceSummary([], [
      {
        hotel_id: 'hotel-1',
        provider: 'booking',
        status: 'connected',
        last_sync_at: '2026-08-21T08:00:00.000Z',
        latest_log: { status: 'success', created_at: '2026-08-21T08:00:00.000Z' },
        recent_updated_item_count: 4,
      },
      {
        hotel_id: 'hotel-2',
        provider: 'booking',
        status: 'error',
        latest_log: { status: 'failed', created_at: '2026-08-20T08:00:00.000Z', error_message: 'timeout' },
        recent_updated_item_count: 2,
      },
    ], now);

    expect(result.totals.otaChannelCount).toBe(1);
    expect(result.totals.otaChannelsWithIssues).toBe(1);
    expect(result.totals.revenue).toBe(0);
    expect(result.channels.find(channel => channel.id === 'ota:booking')).toMatchObject({
      label: 'Booking.com',
      kind: 'ota',
      hotelCount: 2,
      syncStatus: 'error',
      updatedItemCount: 6,
      lastSyncAt: '2026-08-21T08:00:00.000Z',
    });
  });

  it('creates one daily trend point for every day in the period', () => {
    const result = buildChannelPerformanceSummary([{
      id: 'hotel-1',
      bookings: [{
        id: 'booking-1',
        source: 'phone',
        status: 'checked_out',
        check_in: '2026-08-01',
        check_out: '2026-08-03',
        price: 600,
      }],
    }], [], now);

    expect(result.trend).toHaveLength(30);
    expect(result.trend.find(point => point.date === '2026-08-01')).toEqual({ date: '2026-08-01', bookings: 1, revenue: 600 });
  });
});
