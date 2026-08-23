import type { BookingRecord } from './db';

export type ChannelKind = 'booking' | 'ota';
export type ChannelSyncStatus = 'healthy' | 'warning' | 'error' | 'not_applicable';

type BookingRow = Pick<BookingRecord, 'id' | 'source' | 'status' | 'check_in' | 'check_out' | 'price'>;

type HotelWithBookings = {
  id: string;
  bookings: BookingRow[];
};

type OtaLog = {
  status?: string | null;
  created_at?: string | null;
  error_message?: string | null;
};

export type OtaSummaryRow = {
  hotel_id: string;
  provider: string;
  status?: string | null;
  last_sync_at?: string | null;
  latest_log?: OtaLog | null;
  recent_updated_item_count?: number | null;
};

export type ChannelPerformanceChannel = {
  id: string;
  label: string;
  kind: ChannelKind;
  bookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  revenue: number;
  averageBookingValue: number;
  occupancyNights: number;
  hotelCount: number;
  syncStatus: ChannelSyncStatus;
  lastSyncAt: string | null;
  updatedItemCount: number;
};

export type ChannelPerformanceTrendPoint = {
  date: string;
  bookings: number;
  revenue: number;
};

export type ChannelPerformanceResult = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: 'last_30_days';
  totals: {
    bookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    revenue: number;
    occupancyNights: number;
    hotelCount: number;
    otaChannelCount: number;
    otaChannelsWithIssues: number;
  };
  channels: ChannelPerformanceChannel[];
  trend: ChannelPerformanceTrendPoint[];
};

const BOOKING_CHANNEL_LABELS: Record<BookingRow['source'], string> = {
  manual: 'Direct / Manual',
  'walk-in': 'Walk-in',
  phone: 'Phone',
};

const OTA_LABELS: Record<string, string> = {
  agoda: 'Agoda',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  expedia: 'Expedia',
};

function toMoney(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalizeOtaStatus(rows: OtaSummaryRow[]): ChannelSyncStatus {
  if (rows.some(row => row.latest_log?.status === 'failed' || row.status === 'error' || row.status === 'failed')) {
    return 'error';
  }
  if (rows.some(row => row.latest_log?.status !== 'success' || !['connected', 'healthy'].includes(row.status ?? ''))) {
    return 'warning';
  }
  return 'healthy';
}

export function buildChannelPerformanceSummary(
  hotels: HotelWithBookings[],
  otaSummary: OtaSummaryRow[],
  now = new Date(),
): ChannelPerformanceResult {
  const generatedAt = now.toISOString();
  const periodEnd = toIsoDate(now);
  const periodStart = addDays(periodEnd, -29);
  const periodEndExclusive = addDays(periodEnd, 1);
  const allBookings = hotels.flatMap(hotel => hotel.bookings.map(booking => ({ ...booking, hotelId: hotel.id })));
  const periodBookings = allBookings.filter(booking => booking.check_in >= periodStart && booking.check_in <= periodEnd);
  const nonCancelledBookings = periodBookings.filter(booking => booking.status !== 'cancelled');
  const cancelledBookings = periodBookings.filter(booking => booking.status === 'cancelled');
  const trend = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(periodStart, index);
    const dayBookings = periodBookings.filter(booking => booking.check_in === date && booking.status !== 'cancelled');
    return {
      date,
      bookings: dayBookings.length,
      revenue: dayBookings.reduce((total, booking) => total + toMoney(booking.price), 0),
    };
  });

  const channels: ChannelPerformanceChannel[] = (Object.keys(BOOKING_CHANNEL_LABELS) as BookingRow['source'][]).map(source => {
    const sourceBookings = periodBookings.filter(booking => booking.source === source);
    const activeSourceBookings = sourceBookings.filter(booking => booking.status !== 'cancelled');
    const revenue = activeSourceBookings.reduce((total, booking) => total + toMoney(booking.price), 0);
    const hotelIds = new Set(sourceBookings.map(booking => booking.hotelId));
    return {
      id: `booking:${source}`,
      label: BOOKING_CHANNEL_LABELS[source],
      kind: 'booking',
      bookings: activeSourceBookings.length,
      confirmedBookings: activeSourceBookings.filter(booking => booking.status === 'confirmed').length,
      cancelledBookings: sourceBookings.filter(booking => booking.status === 'cancelled').length,
      revenue,
      averageBookingValue: activeSourceBookings.length ? revenue / activeSourceBookings.length : 0,
      occupancyNights: activeSourceBookings.reduce(
        (total, booking) => total + overlapNights(booking.check_in, booking.check_out, periodStart, periodEndExclusive),
        0,
      ),
      hotelCount: hotelIds.size,
      syncStatus: 'not_applicable',
      lastSyncAt: null,
      updatedItemCount: 0,
    };
  });

  const otaProviders = Array.from(new Set(otaSummary.map(row => row.provider))).sort();
  otaProviders.forEach(provider => {
    const rows = otaSummary.filter(row => row.provider === provider);
    const lastSyncAt = rows
      .map(row => row.last_sync_at ?? row.latest_log?.created_at ?? null)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    channels.push({
      id: `ota:${provider}`,
      label: OTA_LABELS[provider] ?? provider,
      kind: 'ota',
      bookings: 0,
      confirmedBookings: 0,
      cancelledBookings: 0,
      revenue: 0,
      averageBookingValue: 0,
      occupancyNights: 0,
      hotelCount: new Set(rows.map(row => row.hotel_id)).size,
      syncStatus: normalizeOtaStatus(rows),
      lastSyncAt,
      updatedItemCount: rows.reduce((total, row) => total + Number(row.recent_updated_item_count ?? 0), 0),
    });
  });

  const otaChannels = channels.filter(channel => channel.kind === 'ota');
  return {
    generatedAt,
    periodStart,
    periodEnd,
    periodLabel: 'last_30_days',
    totals: {
      bookings: nonCancelledBookings.length,
      confirmedBookings: nonCancelledBookings.filter(booking => booking.status === 'confirmed').length,
      cancelledBookings: cancelledBookings.length,
      revenue: nonCancelledBookings.reduce((total, booking) => total + toMoney(booking.price), 0),
      occupancyNights: nonCancelledBookings.reduce(
        (total, booking) => total + overlapNights(booking.check_in, booking.check_out, periodStart, periodEndExclusive),
        0,
      ),
      hotelCount: hotels.length,
      otaChannelCount: otaChannels.length,
      otaChannelsWithIssues: otaChannels.filter(channel => channel.syncStatus !== 'healthy').length,
    },
    channels,
    trend,
  };
}

export const channelPerformanceLabels = {
  booking: BOOKING_CHANNEL_LABELS,
  ota: OTA_LABELS,
};
