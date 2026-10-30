import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import { eq } from 'drizzle-orm';
import { rooms } from '../../drizzle/d1-schema';
import { calculateServiceTotal, calcNights, calculateGrandTotal } from '@shared/pricingModels';
import { TM30_HEADERS, buildTm30Rows, createTm30Workbook } from '../tm30';
import { enforcePublicBookingRateLimit } from '../publicBookingRateLimit';
import {
  listBookingsForHotel,
  holdRoomType as dbHoldRoomType,
  confirmBookingDetails as dbConfirmBookingDetails,
  getPublicHotelAvailability,
} from '../d1/booking';
import { getManagedHotel } from '../d1/hotel';
import { assertBookingMinStay } from '../d1/availability';
import { transitionBookingStatus as dbTransitionBookingStatus } from '../d1/bookingService';
import { createBookingWithGuests } from '../d1/booking';
import {
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const publicChildMeasurementSchema = z.union([
  z.object({ age: z.number().int().min(0).max(17) }),
  z.object({ height_cm: z.number().min(20).max(250) }),
]);
const publicGuestCountsSchema = {
  adults: z.number().int().min(1).max(20).default(2),
  children: z.array(publicChildMeasurementSchema).max(20).default([]),
};
export const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
export const bookingSourceSchema = z.enum(['manual', 'walk-in', 'phone']);

export const publicHotelAvailabilitySchema = z.object({
  slug: z.string().trim().min(1).max(100),
  check_in: z.string().date(),
  check_out: z.string().date(),
  ...publicGuestCountsSchema,
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});

export const holdRoomTypeSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  room_type_id: z.string().uuid(),
  check_in: z.string().date(),
  check_out: z.string().date(),
  ...publicGuestCountsSchema,
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});

export const confirmBookingDetailsSchema = z.object({
  booking_id: z.string().uuid(),
  hotel_id: z.string().uuid(),
  guest_name: z.string().trim().min(1, 'Guest name is required.').max(180),
  guest_email: z.string().trim().email('Invalid email address.').max(320).optional().or(z.literal('')),
  guest_phone: z.string().trim().max(50).optional().or(z.literal('')),
  special_requests: z.string().trim().max(500).optional().or(z.literal('')),
  services: z.array(z.object({
    hotel_service_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
  })).default([]),
});

export const bookings = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'operations.view_bookings');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await listBookingsForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
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
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbTransitionBookingStatus(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const exportTm30 = protectedProcedure.input(hotelIdSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'operations.export_tm30');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const bookingList = await listBookingsForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
    const rows = buildTm30Rows(bookingList as any);
    const workbook = createTm30Workbook(bookingList as any);
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
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const bookingList = await listBookingsForHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
    let rows: string[][] = [];
    try {
      rows = buildTm30Rows(bookingList as any);
    } catch {
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
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    const caller = ctx.caller ?? { userId: ctx.user.id };
    try {
      if (input.room_id) {
        const [room] = await ctx.db.select({ roomTypeId: rooms.roomTypeId }).from(rooms).where(eq(rooms.id, input.room_id)).limit(1);
        if (room?.roomTypeId) {
          await assertBookingMinStay(ctx.db, caller, input.hotel_id, room.roomTypeId, input.check_in, input.check_out);
        }
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return rethrowDomainError(error);
    }
    try {
      const { guests, services, ...booking } = input;
      const nights = calcNights(input.check_in, input.check_out);

      let roomBasePrice = 0;
      if (booking.room_id) {
        const hotelData = await getManagedHotel(ctx.db, caller, booking.hotel_id);
        if (hotelData) {
          const selectedRoom = hotelData.rooms.find((r: any) => r.id === booking.room_id);
          if (selectedRoom) {
            const roomType = hotelData.room_types.find((rt: any) => rt.id === selectedRoom.room_type_id);
            if (roomType) {
              roomBasePrice = Number(roomType.base_price);
            }
          }
        }
      }
      booking.price = calculateGrandTotal(roomBasePrice, nights, services);

      return await createBookingWithGuests(
        ctx.db,
        caller,
        { ...booking, created_by: ctx.user.id } as any,
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

export const publicHotelAvailability = rateLimitedProcedure.input(publicHotelAvailabilitySchema).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await getPublicHotelAvailability(ctx.db, ctx.caller ?? { userId: '', roles: [], access: 'public' } as any, input.slug, input.check_in, input.check_out, {
      adults: input.adults,
      children: input.children,
    });
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const holdRoomType = rateLimitedProcedure.input(holdRoomTypeSchema).mutation(async ({ ctx, input }) => {
  await enforcePublicBookingRateLimit(ctx);
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  let ipHash: string | null = null;
  try {
    const ip = ctx.clientIp || 'unknown';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    ipHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    ipHash = null;
  }
  try {
    return await dbHoldRoomType(ctx.db, ctx.caller ?? { userId: '', roles: [], access: 'public' } as any, {
      slug: input.slug,
      room_type_id: input.room_type_id,
      check_in: input.check_in,
      check_out: input.check_out,
      adults: input.adults,
      children: input.children,
      createdIpHash: ipHash,
    });
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const confirmBookingDetails = rateLimitedProcedure.input(confirmBookingDetailsSchema).mutation(async ({ ctx, input }) => {
  await enforcePublicBookingRateLimit(ctx);
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbConfirmBookingDetails(ctx.db, ctx.caller ?? { userId: '', roles: [], access: 'public' } as any, {
      booking_id: input.booking_id,
      hotel_id: input.hotel_id,
      guest_name: input.guest_name,
      guest_email: input.guest_email || null,
      guest_phone: input.guest_phone || null,
      special_requests: input.special_requests || null,
      services: input.services,
    });
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
  holdRoomType,
  confirmBookingDetails,
});
