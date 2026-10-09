import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import { calculateServiceTotal, calcNights, calculateGrandTotal } from '@shared/pricingModels';
import { TM30_HEADERS, buildTm30Rows, createTm30Workbook } from '../tm30';
import {
  assertBookingMinStay,
  createBookingWithGuests,
  getManagedHotel,
  getPublicHotelAvailability,
  createPublicBooking as dbCreatePublicBooking,
  holdRoomType as dbHoldRoomType,
  confirmBookingDetails as dbConfirmBookingDetails,
  listBookingsForHotel,
  transitionBookingStatus as dbTransitionBookingStatus,
} from '../db';
import { createSupabaseAdminClient } from '../supabase';
import {
  requireHotelPermission,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
export const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
export const bookingSourceSchema = z.enum(['manual', 'walk-in', 'phone']);

export const publicHotelAvailabilitySchema = z.object({
  slug: z.string().trim().min(1).max(100),
  check_in: z.string().date(),
  check_out: z.string().date(),
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});

export const createPublicBookingSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  room_type_id: z.string().uuid(),
  check_in: z.string().date(),
  check_out: z.string().date(),
  guest_name: z.string().trim().min(1, 'Guest name is required.').max(180),
  guest_email: z.string().trim().email('Invalid email address.').max(320).optional().or(z.literal('')),
  guest_phone: z.string().trim().max(50).optional().or(z.literal('')),
  special_requests: z.string().trim().max(500).optional().or(z.literal('')),
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});

export const holdRoomTypeSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  room_type_id: z.string().uuid(),
  check_in: z.string().date(),
  check_out: z.string().date(),
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});

export const confirmBookingDetailsSchema = z.object({
  booking_id: z.string().uuid(),
  guest_name: z.string().trim().min(1, 'Guest name is required.').max(180),
  guest_email: z.string().trim().email('Invalid email address.').max(320).optional().or(z.literal('')),
  guest_phone: z.string().trim().max(50).optional().or(z.literal('')),
  special_requests: z.string().trim().max(500).optional().or(z.literal('')),
  services: z.array(z.object({
    service_name: z.string().trim().min(1),
    pricing_model: z.enum(['PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME']),
    unit_price: z.number().nonnegative(),
    quantity: z.number().int().min(1).default(1),
  })).default([]),
});

export const bookings = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'operations.view_bookings');
  try {
    return await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const transitionBookingStatusSchema = z.object({
  hotel_id: hotelIdSchema,
  booking_id: z.string().uuid(),
  to_status: z.enum(['checked_in', 'checked_out']),
});

export const transitionBookingStatus = protectedProcedure
  .input(transitionBookingStatusSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_checkin_checkout');
    try {
      return await dbTransitionBookingStatus(rlsClient(ctx.user.accessToken), input);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const exportTm30 = protectedProcedure.input(hotelIdSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'operations.export_tm30');
  try {
    const bookingList = await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
    const rows = buildTm30Rows(bookingList);
    const workbook = createTm30Workbook(bookingList);
    return {
      filename: `tm30-${input}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: rows.length,
      base64: workbook.toString('base64'),
    };
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const previewTm30 = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'operations.export_tm30');
  try {
    const bookingList = await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
    let rows: string[][] = [];
    try {
      rows = buildTm30Rows(bookingList);
    } catch {
      // If guest rows are incomplete for TM.30, preview returns empty rows with headers so the user can inspect what is missing
      rows = [];
    }
    return {
      headers: [...TM30_HEADERS],
      rows,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const createBookingSchema = z.object({
  hotel_id: hotelIdSchema,
  room_id: z.string().uuid().nullable(),
  guest_name: z.string().trim().min(1).max(180),
  check_in: z.string().date(),
  check_out: z.string().date(),
  price: z.number().nonnegative(),
  source: bookingSourceSchema,
  payment_method: z.enum(['cash', 'transfer', 'promptpay']).optional(),
  status: bookingStatusSchema.default('confirmed'),
  guests: z.array(z.object({
    first_name: z.string().trim().min(1),
    middle_name: z.string().trim().nullable().optional(),
    last_name: z.string().trim().min(1),
    gender: z.enum(['M', 'F']).nullable().optional(),
    passport_no: z.string().trim().min(1),
    nationality_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    birth_date: z.string().date(),
    phone_no: z.string().trim().nullable().optional(),
  })).default([]),
  services: z.array(z.object({
    service_name: z.string().trim().min(1),
    pricing_model: z.enum(['PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME']),
    unit_price: z.number().nonnegative(),
    quantity: z.number().int().min(1).default(1),
  })).default([]),
}).refine(data => data.source !== 'walk-in' || Boolean(data.payment_method), {
  message: 'Payment method is required for walk-in bookings.',
  path: ['payment_method'],
});

export const createBooking = protectedProcedure
  .input(createBookingSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    if (input.check_out <= input.check_in) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Check-out must be later than check-in.' });
    }
    const client = rlsClient(ctx.user.accessToken);
    try {
      // Router pre-check: enforce min_stay_nights from rate_overrides before insert.
      await assertBookingMinStay(client, input.room_id, input.check_in, input.check_out);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return rethrowDomainError(error);
    }
    try {
      const { guests, services, ...booking } = input;
      const nights = calcNights(input.check_in, input.check_out);
      
      let roomBasePrice = 0;
      if (booking.room_id) {
        const hotelData = await getManagedHotel(client, booking.hotel_id);
        if (hotelData) {
          const selectedRoom = hotelData.rooms.find(r => r.id === booking.room_id);
          if (selectedRoom) {
            const roomType = hotelData.room_types.find(rt => rt.id === selectedRoom.room_type_id);
            if (roomType) {
              roomBasePrice = Number(roomType.base_price);
            }
          }
        }
      }
      booking.price = calculateGrandTotal(roomBasePrice, nights, services);

      return await createBookingWithGuests(
        client,
        { ...booking, created_by: ctx.user.id },
        guests.map(guest => ({
          ...guest,
          middle_name: guest.middle_name ?? null,
          gender: guest.gender ?? null,
          phone_no: guest.phone_no ?? null,
        })),
        services.map(service => ({
          ...service,
          total_price: calculateServiceTotal(service, nights),
        })),
      );
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const publicHotelAvailability = rateLimitedProcedure.input(publicHotelAvailabilitySchema).query(async ({ input }) => {
  try {
    // The public availability response is deliberately aggregated by the server.
    // Use the admin client only after the DB helper checks public_enabled for this slug;
    // do not grant anon direct access to rooms or bookings to calculate inventory.
    return await getPublicHotelAvailability(createSupabaseAdminClient(), input.slug, input.check_in, input.check_out);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const createPublicBooking = rateLimitedProcedure.input(createPublicBookingSchema).mutation(async ({ input }) => {
  try {
    return await dbCreatePublicBooking(createSupabaseAdminClient(), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const holdRoomType = rateLimitedProcedure.input(holdRoomTypeSchema).mutation(async ({ input }) => {
  try {
    return await dbHoldRoomType(createSupabaseAdminClient(), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const confirmBookingDetails = rateLimitedProcedure.input(confirmBookingDetailsSchema).mutation(async ({ input }) => {
  try {
    return await dbConfirmBookingDetails(createSupabaseAdminClient(), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const bookingRouter = router({
  bookings,
  exportTm30,
  previewTm30,
  createBooking,
  publicHotelAvailability,
  createPublicBooking,
  holdRoomType,
  confirmBookingDetails,
});
