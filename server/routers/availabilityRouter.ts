import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import type { Permission } from '@shared/authorization';
import { AVAILABILITY_BATCH_MAX_DAYS, AVAILABILITY_BATCH_MAX_ROOM_TYPES } from '@shared/availabilityBatch';
import { getManagedHotel } from '../d1/hotel';
import {
  listAvailabilityForHotel,
  listBookingOccupancyForHotel,
  updateAvailability as dbUpdateAvailability,
  updateAvailabilityBatch as dbUpdateAvailabilityBatch,
  createRateOverride as dbCreateRateOverride,
  listRateOverrides as dbListRateOverrides,
  deleteRateOverride as dbDeleteRateOverride,
  saveCalendarRange as dbSaveCalendarRange,
  listCalendarForHotel as dbListCalendarForHotel,
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

export const availabilityBatchSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_ids: z.array(z.string().uuid()).min(1).max(AVAILABILITY_BATCH_MAX_ROOM_TYPES),
  start_date: z.string().date(),
  end_date: z.string().date(),
  rooms_available: z.number().int().nonnegative(),
  action: z.enum(['allotment', 'stop_sell']).optional(),
}).refine(data => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date.',
  path: ['end_date'],
}).refine(data => (Date.parse(data.end_date) - Date.parse(data.start_date)) / 86_400_000 < AVAILABILITY_BATCH_MAX_DAYS, {
  message: `Choose a date range of up to ${AVAILABILITY_BATCH_MAX_DAYS} days.`,
  path: ['end_date'],
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

export const saveCalendarRangeSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_ids: z.array(z.string().uuid()).min(1),
  start_date: z.string().date(),
  end_date: z.string().date(),
  rooms_available: z.number().int().nonnegative().optional(),
  availability_action: z.enum(['allotment', 'stop_sell']).optional(),
  price: z.number().nonnegative().nullable().optional(),
  min_stay_nights: z.number().int().positive().nullable().optional(),
  base: z.boolean().optional(),
}).refine(data => data.end_date >= data.start_date, { message: 'End date must be on or after start date.', path: ['end_date'] });

export const listCalendarSchema = z.object({
  hotel_id: hotelIdSchema,
  start_date: z.string().date(),
  end_date: z.string().date(),
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
        action: input.action,
        defaultRoomsAvailable: totalRooms,
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

/**
 * Several room types over a date range in one call (bulk stop sell / allotment). Stop sell (0 rooms)
 * needs `revenue.manage_stop_sell`; any other count needs `revenue.manage_allotment`.
 */
export const updateAvailabilityBatchProcedure = protectedProcedure
  .input(availabilityBatchSchema)
  .mutation(async ({ ctx, input }) => {
    const action = input.action ?? (input.rooms_available === 0 ? 'stop_sell' : 'allotment');
    const permission: Permission = action === 'stop_sell' ? 'revenue.manage_stop_sell' : 'revenue.manage_allotment';
    requireHotelPermission(ctx.user, input.hotel_id, permission);
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbUpdateAvailabilityBatch(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
        hotelId: input.hotel_id,
        roomTypeIds: input.room_type_ids,
        startDate: input.start_date,
        endDate: input.end_date,
        roomsAvailable: input.rooms_available,
        action,
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

export const saveCalendarRangeProcedure = protectedProcedure.input(saveCalendarRangeSchema).mutation(async ({ ctx, input }) => {
  const touchesPrice = (input.price !== undefined && input.price !== null) || input.base === true || input.min_stay_nights !== undefined;
  if (touchesPrice) requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_rates');
  const availabilityAction = input.availability_action ?? (input.rooms_available === 0 ? 'stop_sell' : 'allotment');
  if (input.rooms_available !== undefined) requireHotelPermission(ctx.user, input.hotel_id, availabilityAction === 'stop_sell' ? 'revenue.manage_stop_sell' : 'revenue.manage_allotment');
  if (input.rooms_available === undefined && !touchesPrice) requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_allotment');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbSaveCalendarRange(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotelId: input.hotel_id,
      roomTypeIds: input.room_type_ids,
      startDate: input.start_date,
      endDate: input.end_date,
      roomsAvailable: input.rooms_available ?? null,
      availabilityAction,
      price: input.price === undefined ? undefined : (input.price === null ? null : String(input.price)),
      minStayNights: input.min_stay_nights,
      base: input.base,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listCalendarProcedure = protectedProcedure.input(listCalendarSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbListCalendarForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.start_date, input.end_date);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const availabilityRouter = router({
  availability,
  updateAvailability: updateAvailabilityProcedure,
  updateAvailabilityBatch: updateAvailabilityBatchProcedure,
  createRateOverride: createRateOverrideProcedure,
  listRateOverrides: listRateOverridesProcedure,
  deleteRateOverride: deleteRateOverrideProcedure,
  saveCalendarRange: saveCalendarRangeProcedure,
  listCalendar: listCalendarProcedure,
});
