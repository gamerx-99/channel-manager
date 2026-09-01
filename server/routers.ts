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
  listHotelAdminAuditLogsProcedure as listHotelAdminAuditLogs,
  inviteHotelStaff,
  createSignupLinkProcedure as createSignupLink,
  listSignupLinksProcedure as listSignupLinks,
  validateSignupLinkProcedure as validateSignupLink,
  completeHotelOwnerSignupProcedure as completeHotelOwnerSignup,
  updateHotelStaffRoleProcedure as updateHotelStaffRole,
  transferHotelAdminProcedure as transferHotelAdmin,
  removeHotelStaffProcedure as removeHotelStaff,
  inviteAdminUserProcedure as inviteAdminUser,
  assignAdminUserProcedure as assignAdminUser,
  removeAdminMembershipProcedure as removeAdminMembership,
} from './routers/staffRouter';
import {
  availability,
  updateAvailabilityProcedure as updateAvailability,
  createRateOverrideProcedure as createRateOverride,
  listRateOverridesProcedure as listRateOverrides,
  deleteRateOverrideProcedure as deleteRateOverride,
} from './routers/availabilityRouter';
import {
  createManagedHotel,
  createManagedRoomType,
  updateManagedRoomType,
  deleteManagedRoomType,
  assertBookingMinStay,
  createBookingWithGuests,
  createHotelUserAssignment,
  deleteHotelUserAssignment,
  listHotelOptions,
  getManagedHotel,
  getPublicHotel,
  getPublicHotelAvailability,
  createPublicBooking,
  isSuperAdmin,
  listBookingsForHotel,
  listManagedHotels,
  listManagedHotelsForFinancials,
  getHotelSiteConfig,
  getHotelSiteConfigBySlug,
  saveHotelSiteConfig,
  listHotelMedia,
  createHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
  getSlipOkSettings,
  saveSlipOkSettings,
  removeSlipOkKey,
  savePromptPaySettings,
  getHotelPaymentConfig,
  createPaymentSession,
  getLatestPaymentSession,
  updatePaymentSessionStatus,
  updateBookingPaymentStatus,
} from './db';
import { requireRecentMfaVerification } from './mfa';
import { encryptSlipOkKey, hashSlipOkKey, decryptSlipOkKey } from './slipokCrypto';
import { generatePromptPayQR, buildQrImageUrl } from './promptpay';
import { verifySlipWithSlipOk, SlipOkError } from './slipVerification';
import { systemRouter } from './_core/systemRouter';
import { protectedProcedure, publicProcedure, rateLimitedProcedure, router } from './_core/trpc';
import {
  createRlsSupabaseClient,
  createSupabaseAdminClient,
} from './supabase';
import { buildTm30Rows, createTm30Workbook } from './tm30';
import { storagePut } from './storage';

const hotelIdSchema = z.string().uuid();
const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
const bookingSourceSchema = z.enum(['manual', 'walk-in', 'phone']);
const createHotelSchema = z.object({
  name: z.string().trim().min(1, 'Hotel name is required.').max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.').max(100),
  address: z.string().trim().min(1, 'Address is required.').max(500),
  owner_contact: z.string().trim().min(1, 'Owner contact is required.').max(180),
  public_enabled: z.boolean().default(false),
});
const createRoomTypeSchema = z.object({
  hotel_id: hotelIdSchema,
  name: z.string().trim().min(1, 'Room type name is required.').max(120),
  capacity: z.number().int().positive('Capacity must be at least 1.'),
  base_price: z.number().positive('Base price must be greater than zero.'),
  quantity: z.number().int().positive('Number of rooms must be at least 1.'),
});
const updateRoomTypeSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Room type name is required.').max(120),
  capacity: z.number().int().positive('Capacity must be at least 1.'),
  base_price: z.number().positive('Base price must be greater than zero.'),
});
const deleteRoomTypeSchema = z.object({ hotel_id: hotelIdSchema, room_type_id: z.string().uuid() });
const dashboardCalendarSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO calendar date.'),
  days: z.number().int().min(7).max(31),
}).optional();
const hotelSiteConfigSaveSchema = z.object({
  hotel_id: hotelIdSchema,
  hero_copy: z.string().trim().max(500).nullable().optional(),
  accent_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #954831.').nullable().optional(),
  visible_sections: z.record(z.string(), z.boolean()).nullable().optional(),
});
const uploadHotelMediaSchema = z.object({
  hotel_id: hotelIdSchema,
  base64: z.string().min(1, 'File data is required.'),
  filename: z.string().min(1, 'Filename is required.'),
  caption: z.string().nullable().optional(),
});
const deleteHotelMediaSchema = z.object({
  hotel_id: hotelIdSchema,
  media_id: z.string().uuid(),
});
const setHotelMediaHeroSchema = z.object({
  hotel_id: hotelIdSchema,
  media_id: z.string().uuid(),
});
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
    hotels: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listManagedHotels(rlsClient(ctx.user.accessToken));
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    canCreateHotel: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await isSuperAdmin(rlsClient(ctx.user.accessToken));
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
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
    adminHotels: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, 'platform.manage_hotels');
      try {
        const client = await requireSuperAdmin(ctx.user.accessToken);
        return await listHotelOptions(client);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    inviteAdminUser,
    assignAdminUser,
    removeAdminMembership,
    createHotel: protectedProcedure.input(createHotelSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_hotels');
      const client = rlsClient(ctx.user.accessToken);
      try {
        if (!(await isSuperAdmin(client))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super administrators can create hotels.' });
        }
        return await createManagedHotel(client, input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    hotel: protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
      let hotel;
      try {
        hotel = await getManagedHotel(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
      if (!hotel) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
      }
      return hotel;
    }),
    createRoomType: protectedProcedure.input(createRoomTypeSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
      const client = rlsClient(ctx.user.accessToken);
      try {
        // A readable hotel is a database-enforced membership check; its INSERT policy remains the final authorization gate.
        const hotel = await assertHotelExists(client, input.hotel_id);
        return await createManagedRoomType(client, input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    updateRoomType: protectedProcedure.input(updateRoomTypeSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
        const updated = await updateManagedRoomType(client, input);
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type could not be updated.' });
        }
        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    deleteRoomType: protectedProcedure.input(deleteRoomTypeSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
        const removed = await deleteManagedRoomType(client, input);
        if (!removed) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type could not be deleted.' });
        }
        return { success: true as const, id: removed.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
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
    publicHotel: rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ input }) => {
      try {
        return await getPublicHotel(rlsClient(), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
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
    getHotelSiteConfig: rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ input }) => {
      try {
        const result = await getHotelSiteConfigBySlug(rlsClient(), input);
        // Gracefully return null when table missing or no config row
        return result;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : '';
        if (code === '42P01' || /hotel_site_config.*does not exist/i.test(msg)) return null;
        return rethrowDomainError(error);
      }
    }),
    getHotelSiteConfigByHotelId: protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
      try {
        return await getHotelSiteConfig(rlsClient(ctx.user.accessToken), input.hotel_id);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : '';
        if (code === '42P01' || /hotel_site_config.*does not exist/i.test(msg)) return null;
        return rethrowDomainError(error);
      }
    }),
    saveHotelSiteConfig: protectedProcedure.input(hotelSiteConfigSaveSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        return await saveHotelSiteConfig(client, input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const code = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : '';
        if (code === '42P01' || /hotel_site_config.*does not exist/i.test(msg)) {
          return {
            hotel_id: input.hotel_id,
            hero_copy: input.hero_copy ?? null,
            accent_color: input.accent_color ?? null,
            visible_sections: input.visible_sections ?? null,
            updated_at: new Date().toISOString(),
          };
        }
        return rethrowDomainError(error);
      }
    }),
    listHotelMedia: protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
      try {
        return await listHotelMedia(rlsClient(ctx.user.accessToken), input.hotel_id);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    uploadHotelMedia: protectedProcedure.input(uploadHotelMediaSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        // Extract content type and base64 string
        const match = input.base64.match(/^data:([^;]+);base64,(.+)$/);
        let buffer: Buffer;
        let contentType = 'application/octet-stream';
        if (match) {
          contentType = match[1];
          buffer = Buffer.from(match[2], 'base64');
        } else {
          buffer = Buffer.from(input.base64, 'base64');
        }

        const relKey = `hotel-media/${input.hotel_id}/${input.filename}`;
        const { url } = await storagePut(relKey, buffer, contentType);

        // Find if this is the first image to automatically set it as hero
        const existingMedia = await listHotelMedia(client, input.hotel_id);
        const is_hero = existingMedia.length === 0;
        const display_order = existingMedia.length;

        return await createHotelMedia(client, {
          hotel_id: input.hotel_id,
          url,
          caption: input.caption ?? input.filename,
          is_hero,
          display_order,
        });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    deleteHotelMedia: protectedProcedure.input(deleteHotelMediaSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        const deleted = await deleteHotelMedia(client, input.media_id);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This media item could not be deleted.' });
        }

        // If we deleted the hero, we should promote the first remaining one
        const remaining = await listHotelMedia(client, input.hotel_id);
        if (remaining.length > 0 && !remaining.some(m => m.is_hero)) {
          await setHotelMediaHero(client, input.hotel_id, remaining[0].id);
        }

        return deleted;
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    setHotelMediaHero: protectedProcedure.input(setHotelMediaHeroSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        await setHotelMediaHero(client, input.hotel_id, input.media_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    ota: otaRouter,
  }),

  // ── Phase 01: SlipOK per-hotel payment settings ───────────────────────────
  slipok: slipokRouter,

  // ── Phase 12B: Public booking payment flow ─────────────────────────────
  payment: paymentRouter,
});

export type AppRouter = typeof appRouter;
