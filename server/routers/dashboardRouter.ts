import { z } from 'zod';
import { protectedProcedure } from '../_core/trpc';
import { requirePermission, rethrowDomainError, rlsClient, todayIso, addIsoDays } from '../routerUtils';
import {
  listManagedHotels,
  getManagedHotel,
  listAvailabilityForHotel,
  listManagedHotelsForFinancials,
  listBookingOccupancyForHotel,
} from '../db';
import {
  listManagedHotels as d1ListManagedHotels,
  listManagedHotelsForFinancials as d1ListManagedHotelsForFinancials,
} from '../d1/hotel';
import { getGlobalOtaSummary, getUpdatedItemCount } from '../otaSync';
import { buildFinancialsSummary } from '../financials';
import { isBookingOccupyingInventory } from '@shared/bookingLifecycle';

export const dashboardCalendarSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO calendar date.'),
  days: z.number().int().min(7).max(31),
}).optional();

// Intentionally unguarded by a named permission: aggregates the caller's own hotels only
// (listManagedHotels is RLS-scoped), so there is no single hotel to gate on.
export const dashboard = protectedProcedure.query(async ({ ctx }) => {
  try {
    const hotels: Awaited<ReturnType<typeof listManagedHotels>> = ctx.db
      ? (await d1ListManagedHotels(ctx.db, ctx.caller ?? { userId: ctx.user.id })).map(h => ({
          ...h,
          created_at: typeof h.created_at === 'string' ? h.created_at : new Date(h.created_at).toISOString(),
          bookings: h.bookings.map((b: any) => ({
            ...b,
            source: b.source as any,
            status: b.status as any,
            payment_status: null as string | null,
            price: b.price,
          })),
        }))
      : await listManagedHotels(rlsClient(ctx.user.accessToken));
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
  requirePermission(ctx.user, 'property.view_financials');
  try {
    const hotels = ctx.db
      ? (await d1ListManagedHotelsForFinancials(ctx.db, ctx.caller ?? { userId: ctx.user.id })).map(h => ({
          ...h,
          bookings: h.bookings.map((b: any) => ({
            ...b,
            status: b.status as any,
            rooms: b.rooms ? { room_types: b.rooms.room_types } : { room_types: null },
          })),
        }))
      : await listManagedHotelsForFinancials(rlsClient(ctx.user.accessToken));
    return buildFinancialsSummary(hotels);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

// Intentionally unguarded by a named permission: aggregates the caller's own hotels only
// (listManagedHotels is RLS-scoped), so there is no single hotel to gate on.
export const dashboardCalendar = protectedProcedure.input(dashboardCalendarSchema).query(async ({ ctx, input }) => {
  try {
    const startDate = input?.startDate ?? todayIso();
    const dayCount = input?.days ?? 14;
    const dates = Array.from({ length: dayCount }, (_, index) => addIsoDays(startDate, index));
    const client = rlsClient(ctx.user.accessToken);
    const [hotels, otaSummary] = await Promise.all([
      listManagedHotels(client),
      getGlobalOtaSummary(ctx.user.accessToken),
    ]);

    const hotelCalendars = await Promise.all(hotels.map(async (hotel) => {
      const occupancyEndDate = addIsoDays(dates[dates.length - 1], 1);
      const [hotelDetail, availability, occupancy] = await Promise.all([
        getManagedHotel(client, hotel.id),
        listAvailabilityForHotel(client, hotel.id),
        listBookingOccupancyForHotel(client, hotel.id, dates[0], occupancyEndDate),
      ]);
      if (!hotelDetail) return null;

      const roomCountByType = hotelDetail.rooms.reduce<Record<string, number>>((counts, room) => {
        counts[room.room_type_id] = (counts[room.room_type_id] ?? 0) + 1;
        return counts;
      }, {});
      const availabilityByKey = new Map(availability.map(row => [`${row.room_type_id}:${row.date}`, row]));
      const hotelOtaEvents = otaSummary
        .filter((connection: any) => connection.hotel_id === hotel.id)
        .flatMap((connection: any) => (connection.logs ?? []).map((log: any) => ({
          provider: connection.provider,
          status: log.status,
          createdAt: log.created_at ?? connection.last_sync_at ?? null,
          updatedItemCount: getUpdatedItemCount(log),
          message: log.error_message ?? log.response?.message ?? 'Calendar sync completed',
        })))
        .filter((event: any) => event.createdAt);

      return {
        hotel: { id: hotelDetail.id, name: hotelDetail.name },
        roomTypes: hotelDetail.room_types.map(roomType => ({
          id: roomType.id,
          name: roomType.name,
          totalRooms: roomCountByType[roomType.id] ?? 0,
        })),
        days: dates.map(date => ({
          date,
          bookings: occupancy.filter(booking =>
            booking.check_in <= date && booking.check_out > date && isBookingOccupyingInventory(booking),
          ).length,
          roomTypes: hotelDetail.room_types.map(roomType => {
            const saved = availabilityByKey.get(`${roomType.id}:${date}`);
            const totalRooms = roomCountByType[roomType.id] ?? 0;
            const roomIds = new Set(hotelDetail.rooms
              .filter(room => room.room_type_id === roomType.id)
              .map(room => room.id));
            const bookedRoomIds = new Set(occupancy
              .filter(booking => booking.room_id !== null
                && roomIds.has(booking.room_id)
                && booking.check_in <= date
                && booking.check_out > date
                && isBookingOccupyingInventory(booking))
              .map(booking => booking.room_id));
            const allotment = Math.min(totalRooms, saved?.rooms_available ?? totalRooms);
            const available = Math.max(0, allotment - bookedRoomIds.size);
            return {
              roomTypeId: roomType.id,
              available,
              totalRooms,
              price: Number(saved?.price ?? roomType.base_price),
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
