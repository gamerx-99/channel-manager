import { z } from 'zod';
import { hasAnyPermission, isPlatformRole, roleHasPermission, type AppRole, type HumanRole, type Permission } from '@shared/authorization';
import { calculateServiceTotal, calcNights, calculateGrandTotal } from '@shared/pricingModels';
import { TM30_HEADERS } from './tm30';
import { getGlobalOtaSummary, getUpdatedItemCount } from './otaSync';
import { TRPCError } from '@trpc/server';
import { paymentRouter } from './routers/paymentRouter';
import { slipokRouter } from './routers/slipokRouter';
import { otaRouter } from './routers/otaRouter';
import { dashboard, channelPerformance, financials, dashboardCalendar } from './routers/dashboardRouter';
import { createHousekeepingTask, listHousekeepingTasks, updateHousekeepingTaskStatus } from './routers/housekeepingRouter';
import { listThreads, createThread, listMessages, sendMessage } from './routers/messagingRouter';
import { notificationsRouter } from './routers/notificationsRouter';
import { authRouter } from './routers/authRouter';
import {
  adminUsers,
  hotelStaff,
  listHotelAdminAuditLogs,
  inviteHotelStaff,
  createSignupLink,
  listSignupLinks,
  validateSignupLink,
  completeHotelOwnerSignup,
  updateHotelStaffRole,
  transferHotelAdmin,
  removeHotelStaff,
  inviteAdminUser,
  assignAdminUser,
  removeAdminMembership,
} from './routers/staffRouter';
import {
  availability,
  updateAvailabilityProcedure as updateAvailability,
  createRateOverrideProcedure as createRateOverride,
  listRateOverridesProcedure as listRateOverrides,
  deleteRateOverrideProcedure as deleteRateOverride,
} from './routers/availabilityRouter';
import {
  hotels,
  canCreateHotel,
  adminHotels,
  createHotel,
  hotel,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  publicHotel,
  getHotelSiteConfig,
  getHotelSiteConfigByHotelId,
  saveHotelSiteConfig,
  listHotelMedia,
  uploadHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
} from './routers/hotelRouter';
import {
  assertBookingMinStay,
  createBookingWithGuests,
  getManagedHotel,
  getPublicHotelAvailability,
  createPublicBooking,
  listBookingsForHotel,
  listManagedHotelsForFinancials,
} from './db';
import { systemRouter } from './_core/systemRouter';
import { protectedProcedure, publicProcedure, rateLimitedProcedure, router } from './_core/trpc';
import {
  createRlsSupabaseClient,
  createSupabaseAdminClient,
} from './supabase';
import { buildTm30Rows, createTm30Workbook } from './tm30';

const hotelIdSchema = z.string().uuid();
const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
const bookingSourceSchema = z.enum(['manual', 'walk-in', 'phone']);

const publicHotelAvailabilitySchema = z.object({
  slug: z.string().trim().min(1).max(100),
  check_in: z.string().date(),
  check_out: z.string().date(),
}).refine(data => data.check_out > data.check_in, {
  message: 'Check-out date must be later than check-in date.',
  path: ['check_out'],
});
const createPublicBookingSchema = z.object({
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

import { addIsoDays, todayIso, rlsClient, getIdentityRoles, requirePermission, requireHotelPermission, requireSuperAdmin, assertSingleHotelAdmin, rethrowDomainError, assertHotelExists, assertHotelAndRoomTypeExist } from './routerUtils';



export const appRouter = router({
  system: systemRouter,
  notifications: notificationsRouter,
  auth: authRouter,
  channelManager: router({
    dashboard,
    channelPerformance,
    financials,
    dashboardCalendar,
    hotels,
    canCreateHotel,
    adminUsers,
    hotelStaff,
    listHotelAdminAuditLogs,
    inviteHotelStaff,
    createSignupLink,
    listSignupLinks,
    validateSignupLink,
    completeHotelOwnerSignup,
    updateHotelStaffRole,
    transferHotelAdmin,
    removeHotelStaff,
    adminHotels,
    inviteAdminUser,
    assignAdminUser,
    removeAdminMembership,
    createHotel,
    hotel,
    createRoomType,
    updateRoomType,
    deleteRoomType,
    bookings: protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input, 'operations.view_bookings');
      try {
        return await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    exportTm30: protectedProcedure.input(hotelIdSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input, 'operations.export_tm30');
      try {
        const bookings = await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
        const rows = buildTm30Rows(bookings);
        const workbook = createTm30Workbook(bookings);
        return {
          filename: `tm30-${input}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          rowCount: rows.length,
          base64: workbook.toString('base64'),
        };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    previewTm30: protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input, 'operations.export_tm30');
      try {
        const bookings = await listBookingsForHotel(rlsClient(ctx.user.accessToken), input);
        let rows: string[][] = [];
        try {
          rows = buildTm30Rows(bookings);
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
    }),
    availability,
    createBooking: protectedProcedure
      .input(z.object({
        hotel_id: hotelIdSchema,
        room_id: z.string().uuid().nullable(),
        guest_name: z.string().trim().min(1).max(180),
        check_in: z.string().date(),
        check_out: z.string().date(),
        price: z.number().nonnegative(),
        source: bookingSourceSchema,
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
      }))
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
            booking,
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
      }),
    updateAvailability,
    createRateOverride,
    listRateOverrides,
    deleteRateOverride,
    createHousekeepingTask,
    listHousekeepingTasks,
    updateHousekeepingTaskStatus,
    listThreads,
    createThread,
    listMessages,
    sendMessage,
    publicHotel,
    publicHotelAvailability: rateLimitedProcedure.input(publicHotelAvailabilitySchema).query(async ({ input }) => {
      try {
        return await getPublicHotelAvailability(rlsClient(), input.slug, input.check_in, input.check_out);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    createPublicBooking: rateLimitedProcedure.input(createPublicBookingSchema).mutation(async ({ input }) => {
      try {
        return await createPublicBooking(createSupabaseAdminClient(), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    getHotelSiteConfig,
    getHotelSiteConfigByHotelId,
    saveHotelSiteConfig,
    listHotelMedia,
    uploadHotelMedia,
    deleteHotelMedia,
    setHotelMediaHero,
    ota: otaRouter,
  }),

  // ── Phase 01: SlipOK per-hotel payment settings ───────────────────────────
  slipok: slipokRouter,

  // ── Phase 12B: Public booking payment flow ─────────────────────────────
  payment: paymentRouter,
});

export type AppRouter = typeof appRouter;
