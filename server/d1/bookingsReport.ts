import { eq } from 'drizzle-orm';
import { bookings, bookingServices, hotels, roomTypes, rooms } from '../../drizzle/d1-schema';
import { fromSatang, toSatang } from '@shared/finance';
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from '../db/scope';
import type { ReportBooking } from '../bookingsReport';

/** The report reads one authorized hotel and returns only fields already shown on its bookings page. */
export async function listBookingsReportData(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string) {
  await authorizeHotelAction(db, caller, hotelId, 'reports.view_bookings', 'reports.bookings.read');
  const [hotel] = await db.select({ id: hotels.id, closureRequestedAt: hotels.closureRequestedAt }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel || hotel.closureRequestedAt) return { bookings: [] as ReportBooking[], sellableRooms: 0 };
  const [rows, roomRows, serviceRows] = await Promise.all([
    db.select({ id: bookings.id, guestName: bookings.guestName, checkIn: bookings.checkIn, checkOut: bookings.checkOut,
      createdAt: bookings.createdAt, status: bookings.status, source: bookings.source, price: bookings.price,
      roomTypeName: roomTypes.name })
      .from(bookings).leftJoin(rooms, eq(bookings.roomId, rooms.id)).leftJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
      .where(eq(bookings.hotelId, hotelId)),
    db.select({ status: rooms.status }).from(rooms).where(eq(rooms.hotelId, hotelId)),
    db.select({ bookingId: bookingServices.bookingId, totalPrice: bookingServices.totalPrice })
      .from(bookingServices).innerJoin(bookings, eq(bookingServices.bookingId, bookings.id)).where(eq(bookings.hotelId, hotelId)),
  ]);
  const serviceSatang = new Map<string, number>();
  for (const service of serviceRows) serviceSatang.set(service.bookingId, (serviceSatang.get(service.bookingId) ?? 0) + toSatang(service.totalPrice));
  return {
    bookings: rows.map(({ roomTypeName, createdAt, ...row }) => ({ ...row, roomType: roomTypeName ?? '', createdAt: createdAt.toISOString(),
      roomRevenue: fromSatang(Math.max(0, toSatang(row.price) - (serviceSatang.get(row.id) ?? 0))) })),
    // ASSUMPTION: a room marked for maintenance is unavailable for every day in this report period.
    sellableRooms: roomRows.filter(room => room.status !== 'maintenance').length,
  };
}
