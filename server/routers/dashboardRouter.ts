import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '../_core/trpc';
import { requireFinancialsAccess, rethrowDomainError, todayIso, addIsoDays } from '../routerUtils';
import {
  listManagedHotels as d1ListManagedHotels,
  listManagedHotelsForFinancials as d1ListManagedHotelsForFinancials,
  getManagedHotel as d1GetManagedHotel,
} from '../d1/hotel';
import {
  listAvailabilityForHotel as d1ListAvailabilityForHotel,
  listBookingOccupancyForHotel as d1ListBookingOccupancyForHotel,
} from '../d1/availability';
import { getOtaSummary } from '../d1/ota';
import { buildFinancialsSummary } from '../financials';
import { isBookingOccupyingInventory } from '@shared/bookingLifecycle';

export const dashboardCalendarSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO calendar date.'),
  days: z.number().int().min(7).max(31),
}).optional();

export const dashboard = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const hotels = (await d1ListManagedHotels(ctx.db, ctx.caller ?? { userId: ctx.user.id })).map(h => ({
      ...h,
      created_at: typeof h.created_at === 'string' ? h.created_at : new Date(h.created_at).toISOString(),
      bookings: h.bookings.map((b: any) => ({
        ...b,
        source: b.source as any,
        status: b.status as any,
        payment_status: null as string | null,
        price: b.price,
      })),
    }));
    const today = new Date().toISOString().slice(0, 10);
    const confirmedBookings = hotels.flatMap(hotel => hotel.bookings).filter(booking => booking.status === 'confirmed');
    return {
      hotels,
      summary: {
        hotelCount: hotels.length,
        roomCount: hotels.reduce((total, hotel) => total + hotel.rooms.length, 0),
        availableRoomCount: hotels.reduce(
          (total, hotel) => total + hotel.rooms.filter(room => room.status === 'available').length,
          0,
        ),
        arrivalsToday: confirmedBookings.filter(booking => booking.check_in === today).length,
        recentBookings: confirmedBookings.sort((a, b) => b.check_in.localeCompare(a.check_in)).slice(0, 6),
      },
    };
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const financials = protectedProcedure.query(async ({ ctx }) => {
  requireFinancialsAccess(ctx.user);
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const hotels = (await d1ListManagedHotelsForFinancials(ctx.db, ctx.caller ?? { userId: ctx.user.id })).map(h => ({
      ...h,
      bookings: h.bookings.map((b: any) => ({
        ...b,
        status: b.status as any,
        rooms: b.rooms ? { room_types: b.rooms.room_types } : { room_types: null },
      })),
    }));
    return buildFinancialsSummary(hotels as any);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const dashboardCalendar = protectedProcedure.input(dashboardCalendarSchema).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const db = ctx.db;
    const caller = ctx.caller ?? { userId: ctx.user.id };
    const startDate = input?.startDate ?? todayIso();
    const dayCount = input?.days ?? 14;
    const dates = Array.from({ length: dayCount }, (_, index) => addIsoDays(startDate, index));
    const [hotels, otaSummary] = await Promise.all([
      d1ListManagedHotels(db, caller),
      getOtaSummary(db, caller),
    ]);

    const hotelCalendars = await Promise.all(hotels.map(async (hotel) => {
      const occupancyEndDate = addIsoDays(dates[dates.length - 1], 1);
      const [hotelDetail, availability, occupancy] = await Promise.all([
        d1GetManagedHotel(db, caller, hotel.id),
        d1ListAvailabilityForHotel(db, caller, hotel.id),
        d1ListBookingOccupancyForHotel(db, caller, hotel.id, dates[0], occupancyEndDate),
      ]);
      if (!hotelDetail) return null;

      const roomCountByType = (hotelDetail.rooms as any[]).reduce<Record<string, number>>((counts, room) => {
        counts[room.room_type_id ?? room.roomTypeId] = (counts[room.room_type_id ?? room.roomTypeId] ?? 0) + 1;
        return counts;
      }, {});
      const availabilityByKey = new Map(availability.map(row => [`${row.roomTypeId}:${row.date}`, row]));
      const hotelOtaEvents = otaSummary
        .filter((connection: any) => connection.hotel_id === hotel.id)
        .flatMap((connection: any) => (connection.latest_log ? [connection.latest_log] : []).map((log: any) => ({
          provider: connection.provider,
          status: log.status,
          createdAt: log.created_at ?? connection.last_sync_at ?? null,
          updatedItemCount: log.response?.updatedItemCount ?? 0,
          message: log.error_message ?? log.response?.message ?? 'Calendar sync completed',
        })))
        .filter((event: any) => event.createdAt);

      return {
        hotel: { id: hotelDetail.id, name: hotelDetail.name },
        roomTypes: (hotelDetail.room_types as any[]).map(roomType => ({
          id: roomType.id,
          name: roomType.name,
          totalRooms: roomCountByType[roomType.id] ?? 0,
        })),
        days: dates.map(date => ({
          date,
          bookings: occupancy.filter(booking =>
            (booking.checkIn) <= date && (booking.checkOut) > date && isBookingOccupyingInventory(booking as any),
          ).length,
          roomTypes: (hotelDetail.room_types as any[]).map(roomType => {
            const saved = availabilityByKey.get(`${roomType.id}:${date}`);
            const totalRooms = roomCountByType[roomType.id] ?? 0;
            const roomIds = new Set((hotelDetail.rooms as any[])
              .filter(room => (room.room_type_id ?? room.roomTypeId) === roomType.id)
              .map(room => room.id));
            const bookedRoomIds = new Set(occupancy
              .filter(booking => (booking.roomId) !== null
                && roomIds.has(booking.roomId)
                && (booking.checkIn) <= date
                && (booking.checkOut) > date
                && isBookingOccupyingInventory(booking as any))
              .map(booking => booking.roomId));
            const allotment = Math.min(totalRooms, saved?.roomsAvailable ?? totalRooms);
            const available = Math.max(0, allotment - bookedRoomIds.size);
            return {
              roomTypeId: roomType.id,
              available,
              totalRooms,
              price: Number(saved?.price ?? roomType.base_price ?? roomType.basePrice),
              status: (available <= 0 ? 'closed' : available <= Math.max(1, Math.ceil(totalRooms * 0.25)) ? 'low' : 'healthy') as 'healthy' | 'low' | 'closed',
            };
          }),
          syncEvents: hotelOtaEvents.filter((event: any) => event.createdAt.slice(0, 10) === date),
        })),
      };
    }));

    const visibleHotelCalendars = hotelCalendars.filter((hotel): hotel is NonNullable<typeof hotel> => Boolean(hotel));
    return {
      startDate,
      endDate: dates[dates.length - 1],
      generatedAt: new Date().toISOString(),
      hotels: visibleHotelCalendars,
    };
  } catch (error) {
    return rethrowDomainError(error);
  }
});
