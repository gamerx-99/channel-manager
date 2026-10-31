type BookingRecord = { id: string; status: string; check_in: string; check_out: string; price: string | null; [key: string]: any };

type BookingRow = Pick<BookingRecord, 'id' | 'status' | 'check_in' | 'check_out' | 'price'> & {
  payment_status?: string | null;
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
  periodLabel: 'last_30_days';
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

export function buildFinancialsSummary(hotels: HotelWithBookings[], now = new Date()): FinancialsResult {
  const generatedAt = now.toISOString();
  const periodEnd = toIsoDate(now);
  const periodStart = addDays(periodEnd, -29);
  const periodEndExclusive = addDays(periodEnd, 1);

  const allBookings = hotels.flatMap(hotel => hotel.bookings);
  const periodBookings = allBookings.filter(booking => booking.check_in >= periodStart && booking.check_in <= periodEnd);
  const activeBookings = periodBookings.filter(booking => booking.status !== 'cancelled');
  const cancelledBookings = periodBookings.filter(booking => booking.status === 'cancelled');
  const revenue = activeBookings.reduce((total, booking) => total + toMoney(booking.price), 0);
  let collectedRevenue = 0;
  let outstandingRevenue = 0;
  let pendingRevenue = 0;
  for (const booking of activeBookings) {
    const amount = toMoney(booking.price);
    if (booking.payment_status === "verified") {
      collectedRevenue += amount;
    } else if (booking.payment_status === "pending") {
      pendingRevenue += amount;
    } else {
      outstandingRevenue += amount;
    }
  }

  const trend = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(periodStart, index);
    const dayBookings = periodBookings.filter(booking => booking.check_in === date && booking.status !== 'cancelled');
    return {
      date,
      bookings: dayBookings.length,
      revenue: dayBookings.reduce((total, booking) => total + toMoney(booking.price), 0),
    };
  });

  const roomTypeTotals = new Map<string, { bookings: number; revenue: number }>();
  for (const booking of activeBookings) {
    const name = booking.rooms?.room_types?.name ?? 'Unassigned';
    const entry = roomTypeTotals.get(name) ?? { bookings: 0, revenue: 0 };
    entry.bookings += 1;
    entry.revenue += toMoney(booking.price);
    roomTypeTotals.set(name, entry);
  }
  const roomTypeBreakdown: FinancialsRoomTypeBreakdown[] = Array.from(roomTypeTotals.entries())
    .map(([name, entry]) => ({
      name,
      bookings: entry.bookings,
      revenue: entry.revenue,
      averageBookingValue: entry.bookings ? entry.revenue / entry.bookings : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    generatedAt,
    periodStart,
    periodEnd,
    periodLabel: 'last_30_days',
    totals: {
      revenue,
      bookings: activeBookings.length,
      cancelledBookings: cancelledBookings.length,
      averageBookingValue: activeBookings.length ? revenue / activeBookings.length : 0,
      occupancyNights: activeBookings.reduce(
        (total, booking) => total + overlapNights(booking.check_in, booking.check_out, periodStart, periodEndExclusive),
        0,
      ),
      hotelCount: hotels.length,
      collectedRevenue,
      outstandingRevenue,
      pendingRevenue,
    },
    trend,
    roomTypeBreakdown,
  };
}
