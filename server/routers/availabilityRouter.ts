import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import type { Permission } from '@shared/authorization';
import { getManagedHotel } from '../d1/hotel';
import {
  listAvailabilityForHotel,
  listBookingOccupancyForHotel,
  updateAvailability as dbUpdateAvailability,
  createRateOverride as dbCreateRateOverride,
  listRateOverrides as dbListRateOverrides,
  deleteRateOverride as dbDeleteRateOverride,
} from '../d1/availability';
import {
  requirePermission,
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();

export const availabilityUpdateSchema = z.object({
  hotel_id: hotelIdSchema.optional(),
  room_type_id: z.string().uuid(),
  date: z.string().date(),
  price: z.number().nonnegative(),
  rooms_available: z.number().int().nonnegative(),
  action: z.enum(['rate', 'allotment', 'stop_sell']).default('rate'),
});

export const createRateOverrideSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid(),
  start_date: z.string().date(),
  end_date: z.string().date(),
  override_price: z.number().nonnegative(),
  min_stay_nights: z.number().int().positive().nullable().optional(),
}).refine(data => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date.',
  path: ['end_date'],
});

export const listRateOverridesSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid().optional(),
});

export const deleteRateOverrideSchema = z.object({
  hotel_id: hotelIdSchema,
  rate_override_id: z.string().uuid(),
});

export const availability = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'property.view');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await listAvailabilityForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const bookingOccupancySchema = z.object({
  hotel_id: hotelIdSchema,
  check_in: z.string().date(),
  check_out: z.string().date(),
}).refine(input => input.check_out > input.check_in, {
  message: 'Check-out date must be after check-in date.',
  path: ['check_out'],
});

export const bookingOccupancy = protectedProcedure.input(bookingOccupancySchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await listBookingOccupancyForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.check_in, input.check_out);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const updateAvailabilityProcedure = protectedProcedure
  .input(availabilityUpdateSchema)
  .mutation(async ({ ctx, input }) => {
    const permission: Permission = input.action === 'stop_sell'
      ? 'revenue.manage_stop_sell'
      : input.action === 'allotment'
        ? 'revenue.manage_allotment'
        : 'revenue.manage_rates';
    if (!input.hotel_id) {
      requirePermission(ctx.user, permission);
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'hotel_id is required.' });
    }
    requireHotelPermission(ctx.user, input.hotel_id, permission);
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      const hotel = await getManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
      if (!hotel?.room_types.some(roomType => roomType.id === input.room_type_id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room type not found.' });
      }
      const totalRooms = hotel.rooms.filter(room => room.room_type_id === input.room_type_id).length;
      if (input.rooms_available > totalRooms) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Available rooms cannot exceed the ${totalRooms} rooms configured for this room type.` });
      }
      return await dbUpdateAvailability(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
        hotelId: input.hotel_id,
        roomTypeId: input.room_type_id,
        date: input.date,
        price: String(input.price),
        roomsAvailable: input.rooms_available,
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const createRateOverrideProcedure = protectedProcedure.input(createRateOverrideSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbCreateRateOverride(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotelId: input.hotel_id,
      roomTypeId: input.room_type_id,
      startDate: input.start_date,
      endDate: input.end_date,
      overridePrice: String(input.override_price),
      minStayNights: input.min_stay_nights ?? null,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listRateOverridesProcedure = protectedProcedure.input(listRateOverridesSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbListRateOverrides(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.room_type_id);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const deleteRateOverrideProcedure = protectedProcedure.input(deleteRateOverrideSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const removed = await dbDeleteRateOverride(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.rate_override_id);
    if (!removed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This rate override was not found.' });
    }
    return { success: true as const, id: removed.id };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const availabilityRouter = router({
  availability,
  updateAvailability: updateAvailabilityProcedure,
  createRateOverride: createRateOverrideProcedure,
  listRateOverrides: listRateOverridesProcedure,
  deleteRateOverride: deleteRateOverrideProcedure,
});
