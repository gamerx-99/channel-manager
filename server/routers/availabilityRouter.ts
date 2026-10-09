import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import type { Permission } from '@shared/authorization';
import {
  listAvailabilityForHotel,
  listBookingOccupancyForHotel,
  updateAvailability as dbUpdateAvailability,
  createRateOverride as dbCreateRateOverride,
  listRateOverrides as dbListRateOverrides,
  deleteRateOverride as dbDeleteRateOverride,
} from '../db';
import {
  requirePermission,
  requireHotelPermission,
  assertHotelAndRoomTypeExist,
  rethrowDomainError,
  rlsClient,
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
  try {
    return await listAvailabilityForHotel(rlsClient(ctx.user.accessToken), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const bookingOccupancy = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'property.view');
  try {
    return await listBookingOccupancyForHotel(rlsClient(ctx.user.accessToken), input);
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
    const client = rlsClient(ctx.user.accessToken);
    if (input.hotel_id) {
      requireHotelPermission(ctx.user, input.hotel_id, permission);
      try {
        const hotel = await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
        const totalRooms = hotel.rooms.filter(room => room.room_type_id === input.room_type_id).length;
        if (input.rooms_available > totalRooms) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Available rooms cannot exceed the ${totalRooms} rooms configured for this room type.` });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    } else {
      requirePermission(ctx.user, permission);
    }
    try {
      const { hotel_id: _hotelId, action: _action, ...availabilityInput } = input;
      return await dbUpdateAvailability(client, availabilityInput);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const createRateOverrideProcedure = protectedProcedure.input(createRateOverrideSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  const client = rlsClient(ctx.user.accessToken);
  try {
    const hotel = await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
    return await dbCreateRateOverride(client, {
      room_type_id: input.room_type_id,
      start_date: input.start_date,
      end_date: input.end_date,
      override_price: input.override_price,
      min_stay_nights: input.min_stay_nights ?? null,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listRateOverridesProcedure = protectedProcedure.input(listRateOverridesSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  try {
    return await dbListRateOverrides(rlsClient(ctx.user.accessToken), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const deleteRateOverrideProcedure = protectedProcedure.input(deleteRateOverrideSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
  const client = rlsClient(ctx.user.accessToken);
  try {
    const removed = await dbDeleteRateOverride(client, input.rate_override_id);
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
