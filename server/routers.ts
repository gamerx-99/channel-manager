import { z } from 'zod';
import { hasAnyPermission, isPlatformRole, roleHasPermission, type AppRole, type HumanRole, type Permission } from '@shared/authorization';
import { calculateServiceTotal, calcNights, calculateGrandTotal } from '@shared/pricingModels';
import { TM30_HEADERS } from './tm30';
import { getOtaConnections, getGlobalOtaSummary, getUpdatedItemCount, upsertOtaConnection, getOtaSyncLogs, triggerOtaCalendarSync } from './otaSync';
import { TRPCError } from '@trpc/server';
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
  listHotelUserAssignments,
  listHotelStaff,
  listHotelAdminAuditLogs,
  updateHotelUserAssignmentRole,
  transferHotelAdmin,
  getManagedHotel,
  getPublicHotel,
  getPublicHotelAvailability,
  createPublicBooking,
  isSuperAdmin,
  listAvailabilityForHotel,
  listBookingsForHotel,
  listManagedHotels,
  listManagedHotelsForFinancials,
  updateAvailability,
  listRateOverrides,
  createRateOverride,
  deleteRateOverride,
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTaskStatus,
  createMessageThread,
  listThreads,
  createMessage,
  listMessages,
  getHotelSiteConfig,
  getHotelSiteConfigBySlug,
  saveHotelSiteConfig,
  listHotelMedia,
  createHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
  listNotifications,
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSystemNotificationsRead,
  insertNotification,
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
  createHotelOwnerMembership,
  createSignupLink,
  deleteAuthUser,
  getAuthUser,
  getValidSignupLink,
  inviteAuthUser,
  listAuthUsers,
  listSignupLinksForHotel,
  redeemSignupLink,
} from './supabase';
import { buildTm30Rows, createTm30Workbook } from './tm30';
import { buildChannelPerformanceSummary } from './channelPerformance';
import { buildFinancialsSummary } from './financials';
import { deriveSignupLinkStatus, generateSignupToken } from './signupLinks';
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
const adminUserIdSchema = z.string().uuid();
const adminUserRoleSchema = z.enum(['super_admin', 'admin', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping']);
const adminUserEmailSchema = z.string().trim().email('Enter a valid email address.').max(320).transform(email => email.toLowerCase());
const assignUserSchema = z.object({
  user_id: adminUserIdSchema,
  hotel_id: hotelIdSchema,
  role: adminUserRoleSchema,
});
const inviteUserSchema = z.object({
  email: adminUserEmailSchema,
  hotel_id: hotelIdSchema,
  role: adminUserRoleSchema,
});
const removeMembershipSchema = z.object({ membership_id: adminUserIdSchema });
const hotelStaffListSchema = z.object({ hotel_id: hotelIdSchema });
const hotelStaffRoleValueSchema = z.enum(['hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping']);
const hotelStaffInviteSchema = z.object({
  hotel_id: hotelIdSchema,
  email: adminUserEmailSchema,
  role: hotelStaffRoleValueSchema,
});
const hotelStaffRoleSchema = z.object({
  hotel_id: hotelIdSchema,
  membership_id: adminUserIdSchema,
  role: hotelStaffRoleValueSchema,
});
const hotelStaffRemoveSchema = z.object({
  hotel_id: hotelIdSchema,
  membership_id: adminUserIdSchema,
});
const hotelStaffTransferSchema = z.object({
  hotel_id: hotelIdSchema,
  target_membership_id: adminUserIdSchema,
});
const hotelAdminAuditLogListSchema = z.object({
  hotel_id: hotelIdSchema,
  limit: z.number().int().min(1).max(100).default(50),
});
const dashboardCalendarSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO calendar date.'),
  days: z.number().int().min(7).max(31),
}).optional();
const availabilityUpdateSchema = z.object({
  hotel_id: hotelIdSchema.optional(),
  room_type_id: z.string().uuid(),
  date: z.string().date(),
  price: z.number().nonnegative(),
  rooms_available: z.number().int().nonnegative(),
  action: z.enum(['rate', 'allotment', 'stop_sell']).default('rate'),
});
const createRateOverrideSchema = z.object({
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
const listRateOverridesSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid().optional(),
});
const deleteRateOverrideSchema = z.object({
  hotel_id: hotelIdSchema,
  rate_override_id: z.string().uuid(),
});
const housekeepingTaskStatusSchema = z.enum(['pending', 'in_progress', 'done']);
const createHousekeepingTaskSchema = z.object({
  hotel_id: hotelIdSchema,
  room_id: z.string().uuid(),
  booking_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  status: housekeepingTaskStatusSchema.default('pending'),
});
const listHousekeepingTasksSchema = z.object({
  hotel_id: hotelIdSchema,
});
const updateHousekeepingTaskStatusSchema = z.object({
  hotel_id: hotelIdSchema,
  task_id: z.string().uuid(),
  status: housekeepingTaskStatusSchema,
  assigned_to: z.string().uuid().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
});
const listThreadsSchema = z.object({
  hotel_id: hotelIdSchema,
  booking_id: z.string().uuid().optional(),
});
const createThreadSchema = z.object({
  hotel_id: hotelIdSchema,
  booking_id: z.string().uuid().nullable().optional(),
});
const listMessagesSchema = z.object({
  hotel_id: hotelIdSchema,
  thread_id: z.string().uuid(),
});
const sendMessageSchema = z.object({
  hotel_id: hotelIdSchema,
  thread_id: z.string().uuid(),
  body: z.string().trim().min(1, 'Message body is required.').max(4000),
});
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
  notifications: router({
    list: protectedProcedure
      .input(z.object({ hotelId: z.string().uuid().optional() }))
      .query(async ({ ctx, input }) => {
        try {
          if (!input.hotelId) {
            if (ctx.user.role !== 'super_admin') {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Only Super Admins can fetch all notifications globally.' });
            }
            return await listAllNotifications(createSupabaseAdminClient());
          }
          await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
          return await listNotifications(rlsClient(ctx.user.accessToken), input.hotelId);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
    markRead: protectedProcedure
      .input(z.object({ hotelId: z.string().uuid().optional(), notificationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          if (!input.hotelId) {
            if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
            return await markNotificationRead(createSupabaseAdminClient(), input.notificationId);
          }
          await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
          return await markNotificationRead(rlsClient(ctx.user.accessToken), input.notificationId);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
    markAllRead: protectedProcedure
      .input(z.object({ hotelId: z.string().uuid().optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          if (!input.hotelId) {
            if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
            await markSystemNotificationsRead(createSupabaseAdminClient());
            return { success: true };
          }
          await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
          await markAllNotificationsRead(rlsClient(ctx.user.accessToken), input.hotelId);
          return { success: true };
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true as const })),
  }),
  channelManager: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      try {
        const hotels = await listManagedHotels(rlsClient(ctx.user.accessToken));
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
    }),
    channelPerformance: protectedProcedure.query(async ({ ctx }) => {
      try {
        const client = rlsClient(ctx.user.accessToken);
        const [hotels, otaSummary] = await Promise.all([
          listManagedHotels(client),
          getGlobalOtaSummary(ctx.user.accessToken),
        ]);
        return buildChannelPerformanceSummary(hotels, otaSummary);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    financials: protectedProcedure.query(async ({ ctx }) => {
      // Deliberately requirePermission (not requireHotelPermission): the latter
      // unconditionally bypasses for super_admin, which would defeat the point of
      // property.view_financials being withheld from platform roles by default.
      requirePermission(ctx.user, 'property.view_financials');
      try {
        const hotels = await listManagedHotelsForFinancials(rlsClient(ctx.user.accessToken));
        return buildFinancialsSummary(hotels);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    dashboardCalendar: protectedProcedure.input(dashboardCalendarSchema).query(async ({ ctx, input }) => {
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
          const [hotelDetail, availability] = await Promise.all([
            getManagedHotel(client, hotel.id),
            listAvailabilityForHotel(client, hotel.id),
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
              bookings: hotel.bookings.filter(booking => booking.status !== 'cancelled' && booking.check_in <= date && booking.check_out > date).length,
              roomTypes: hotelDetail.room_types.map(roomType => {
                const saved = availabilityByKey.get(`${roomType.id}:${date}`);
                const totalRooms = roomCountByType[roomType.id] ?? 0;
                const available = saved?.rooms_available ?? (date === todayIso()
                  ? hotelDetail.rooms.filter(room => room.room_type_id === roomType.id && room.status === 'available').length
                  : totalRooms);
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
    }),
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
    adminUsers: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, 'platform.manage_users');
      try {
        const client = await requireSuperAdmin(ctx.user.accessToken);
        const [users, assignments] = await Promise.all([
          listAuthUsers(),
          listHotelUserAssignments(client),
        ]);
        return { users, assignments };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    hotelStaff: protectedProcedure.input(hotelStaffListSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        const users = await listAuthUsers();
        return {
          hotel: { id: hotel.id, name: hotel.name },
          staff: await listHotelStaff(client, input.hotel_id, users),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    listHotelAdminAuditLogs: protectedProcedure.input(hotelAdminAuditLogListSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        return await listHotelAdminAuditLogs(client, input.hotel_id, input.limit);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    inviteHotelStaff: protectedProcedure.input(hotelStaffInviteSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        const assignments = await listHotelUserAssignments(client);
        if (input.role === 'hotel_owner') {
          assertSingleHotelAdmin(assignments, input.hotel_id);
        }
        const users = await listAuthUsers();
        const existingUser = users.find(user => user.email?.toLowerCase() === input.email);
        if (existingUser && assignments.some(row => row.hotel_id === input.hotel_id && row.user_id === existingUser.id)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This user is already assigned to the selected hotel.' });
        }
        const user = existingUser ?? await inviteAuthUser(input.email);
        try {
          const membership = await createHotelUserAssignment(client, {
            user_id: user.id,
            hotel_id: input.hotel_id,
            role: input.role,
          });
          return { user, membership, invitationSent: !existingUser };
        } catch (membershipError) {
          if (!existingUser) {
            try {
              await deleteAuthUser(user.id);
            } catch {
              // Preserve the original membership error if cleanup is unavailable.
            }
          }
          throw membershipError;
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    createSignupLink: protectedProcedure.input(z.object({
      hotel_id: hotelIdSchema,
      expiresInHours: z.number().int().min(1).max(720),
    })).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'platform.manage_signup_links');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        const assignments = await listHotelUserAssignments(client);
        assertSingleHotelAdmin(assignments, input.hotel_id);
        const token = generateSignupToken();
        const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
        return await createSignupLink(input.hotel_id, ctx.user.id, token, expiresAt);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    listSignupLinks: protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'platform.manage_signup_links');
      try {
        const links = await listSignupLinksForHotel(input.hotel_id);
        return links.map(link => ({ ...link, status: deriveSignupLinkStatus(link) }));
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    validateSignupLink: rateLimitedProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ input }) => {
      const link = await getValidSignupLink(input.token);
      if (!link) return { valid: false as const };
      return { valid: true as const, hotelName: link.hotelName };
    }),
    completeHotelOwnerSignup: rateLimitedProcedure.input(z.object({
      token: z.string().min(1),
      userId: z.string().uuid(),
    })).mutation(async ({ input }) => {
      const redeemed = await redeemSignupLink(input.token, input.userId);
      if (!redeemed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This signup link is no longer valid.' });
      }
      try {
        await createHotelOwnerMembership(redeemed.hotel_id, input.userId);
      } catch (error) {
        return rethrowDomainError(error);
      }
      return { success: true as const };
    }),
    updateHotelStaffRole: protectedProcedure.input(hotelStaffRoleSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const assignments = await listHotelUserAssignments(client);
        const membership = assignments.find(row => row.id === input.membership_id && row.hotel_id === input.hotel_id);
        if (!membership) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel staff membership was not found.' });
        }
        if (membership.user_id === ctx.user.id && input.role !== 'hotel_owner') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove your own Hotel Admin access.' });
        }
        if (membership.role === 'hotel_owner' && input.role !== 'hotel_owner') {
          const ownerCount = assignments.filter(row => row.hotel_id === input.hotel_id && row.role === 'hotel_owner').length;
          if (ownerCount <= 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'The last Hotel Admin cannot be demoted.' });
          }
        }
        if (input.role === 'hotel_owner') {
          assertSingleHotelAdmin(assignments, input.hotel_id, membership.id);
        }
        const updated = await updateHotelUserAssignmentRole(client, {
          hotel_id: input.hotel_id,
          membership_id: input.membership_id,
          role: input.role as HumanRole,
        });
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel staff membership could not be updated.' });
        }
        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    transferHotelAdmin: protectedProcedure.input(hotelStaffTransferSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const assignments = await listHotelUserAssignments(client);
        const currentOwner = assignments.find(row => row.hotel_id === input.hotel_id && row.role === 'hotel_owner');
        const target = assignments.find(row => row.id === input.target_membership_id && row.hotel_id === input.hotel_id);
        if (!currentOwner) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This hotel does not have a current Hotel Admin to transfer.' });
        }
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'The selected staff member is not assigned to this hotel.' });
        }
        if (target.id === currentOwner.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a different staff member to receive Hotel Admin access.' });
        }
        const targetRole = target.role as AppRole;
        if (isPlatformRole(targetRole) || targetRole === 'api_service') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a human hotel staff member can receive Hotel Admin access.' });
        }
        const transferred = await transferHotelAdmin(client, {
          hotel_id: input.hotel_id,
          target_membership_id: input.target_membership_id,
        });
        if (!transferred) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'The selected staff member could not receive Hotel Admin access.' });
        }
        return transferred;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    removeHotelStaff: protectedProcedure.input(hotelStaffRemoveSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const assignments = await listHotelUserAssignments(client);
        const membership = assignments.find(row => row.id === input.membership_id && row.hotel_id === input.hotel_id);
        if (!membership) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel staff membership was not found.' });
        }
        if (membership.user_id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove your own Hotel Admin access.' });
        }
        if (membership.role === 'hotel_owner') {
          const ownerCount = assignments.filter(row => row.hotel_id === input.hotel_id && row.role === 'hotel_owner').length;
          if (ownerCount <= 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'The last Hotel Admin cannot be removed.' });
          }
        }
        const removed = await deleteHotelUserAssignment(client, input.membership_id);
        if (!removed) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel staff membership could not be removed.' });
        }
        return { success: true as const, id: removed.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
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
    inviteAdminUser: protectedProcedure.input(inviteUserSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_users');
      const client = await requireSuperAdmin(ctx.user.accessToken);
      try {
        const hotel = await assertHotelExists(client, input.hotel_id);
        const invitedUser = await inviteAuthUser(input.email);
        try {
          const membership = await createHotelUserAssignment(client, {
            user_id: invitedUser.id,
            hotel_id: input.hotel_id,
            role: input.role,
          });
          return { user: invitedUser, membership };
        } catch (membershipError) {
          try {
            await deleteAuthUser(invitedUser.id);
          } catch {
            // Do not replace the original membership error if cleanup is unavailable.
          }
          throw membershipError;
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    assignAdminUser: protectedProcedure.input(assignUserSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_users');
      const client = await requireSuperAdmin(ctx.user.accessToken);
      try {
        const [user, hotel, assignments] = await Promise.all([
          getAuthUser(input.user_id),
          getManagedHotel(client, input.hotel_id),
          listHotelUserAssignments(client),
        ]);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'The selected Auth user was not found.' });
        if (!hotel) throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        if (assignments.some(row => row.hotel_id === input.hotel_id && row.user_id === input.user_id)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This user is already assigned to the selected hotel.' });
        }
        if (input.role === 'hotel_owner') {
          assertSingleHotelAdmin(assignments, input.hotel_id);
        }
        return await createHotelUserAssignment(client, input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    removeAdminMembership: protectedProcedure.input(removeMembershipSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_users');
      const client = await requireSuperAdmin(ctx.user.accessToken);
      try {
        const assignments = await listHotelUserAssignments(client);
        const membership = assignments.find(row => row.id === input.membership_id);
        if (!membership) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel membership was not found.' });
        }
        if (membership.role === 'super_admin' && membership.user_id === ctx.user.id) {
          const remainingSuperAdmins = assignments.filter(row => row.role === 'super_admin' && row.id !== membership.id);
          if (remainingSuperAdmins.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'The last super administrator cannot be removed.' });
          }
        }
        const removed = await deleteHotelUserAssignment(client, input.membership_id);
        if (!removed) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel membership was not found.' });
        }
        return { success: true as const, id: removed.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
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
    availability: protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input, 'property.view');
      try {
        return await listAvailabilityForHotel(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
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
    updateAvailability: protectedProcedure
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
          return await updateAvailability(client, availabilityInput);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
    createRateOverride: protectedProcedure.input(createRateOverrideSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const hotel = await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
        return await createRateOverride(client, {
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
    }),
    listRateOverrides: protectedProcedure.input(listRateOverridesSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
      try {
        return await listRateOverrides(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    deleteRateOverride: protectedProcedure.input(deleteRateOverrideSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const removed = await deleteRateOverride(client, input.rate_override_id);
        if (!removed) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This rate override was not found.' });
        }
        return { success: true as const, id: removed.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    createHousekeepingTask: protectedProcedure.input(createHousekeepingTaskSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.update_room_status');
      // due_date required when no booking — db helper derives it from booking.check_out when booking_id provided
      if (!input.due_date && !input.booking_id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'due_date is required when no booking is linked.' });
      }
      const client = rlsClient(ctx.user.accessToken);
      try {
        await assertHotelExists(client, input.hotel_id);
        // Assignee membership validation and booking due_date derivation are handled by createHousekeepingTask in db.ts
        return await createHousekeepingTask(client, {
          room_id: input.room_id,
          booking_id: input.booking_id ?? null,
          assigned_to: input.assigned_to ?? null,
          due_date: input.due_date ?? null,
          status: input.status,
        });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    listHousekeepingTasks: protectedProcedure.input(listHousekeepingTasksSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.view_room_status');
      try {
        // 42P01 graceful handling (missing migration) is done inside listHousekeepingTasks in db.ts
        return await listHousekeepingTasks(rlsClient(ctx.user.accessToken), { hotel_id: input.hotel_id });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    updateHousekeepingTaskStatus: protectedProcedure.input(updateHousekeepingTaskStatusSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.update_room_status');
      const client = rlsClient(ctx.user.accessToken);
      try {
        await assertHotelExists(client, input.hotel_id);
        // Assignee membership validation, booking due_date derivation, and 42P01 handling are all in updateHousekeepingTaskStatus in db.ts
        const updated = await updateHousekeepingTaskStatus(client, {
          task_id: input.task_id,
          status: input.status,
          assigned_to: input.assigned_to,
          booking_id: input.booking_id ?? undefined,
          due_date: input.due_date,
        });
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This housekeeping task was not found.' });
        }
        return updated;
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    listThreads: protectedProcedure.input(listThreadsSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
      try {
        return await listThreads(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
    createThread: protectedProcedure.input(createThreadSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
      try {
        return await createMessageThread(rlsClient(ctx.user.accessToken), input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
    listMessages: protectedProcedure.input(listMessagesSchema).query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
      const client = rlsClient(ctx.user.accessToken);
      try {
        // Verify thread belongs to the requested hotel; FORBIDDEN if outside caller's hotel scope.
        const { data: thread, error: threadError } = await (client as any)
          .from('message_threads')
          .select('id,hotel_id,booking_id')
          .eq('id', input.thread_id)
          .maybeSingle();
        if (threadError) throw threadError;
        const threadHotelId = (thread as { hotel_id?: string } | null)?.hotel_id;
        if (!threadHotelId || threadHotelId !== input.hotel_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This thread is not available to your account.' });
        }
        // If thread is linked to a booking, ensure that booking still belongs to the same hotel (defense in depth).
        const bookingId = (thread as { booking_id?: string | null } | null)?.booking_id;
        if (bookingId) {
          const { data: booking, error: bookingError } = await (client as any)
            .from('bookings')
            .select('hotel_id')
            .eq('id', bookingId)
            .maybeSingle();
          if (bookingError) throw bookingError;
          const bookingHotelId = (booking as { hotel_id?: string } | null)?.hotel_id;
          if (bookingHotelId && bookingHotelId !== input.hotel_id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Booking does not belong to this hotel.' });
          }
        }
        return await listMessages(client, input.thread_id);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const code = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : '';
        if (code === '42P01' || /message_threads|messages.*does not exist/i.test(msg)) return [];
        return rethrowDomainError(error);
      }
    }),
    sendMessage: protectedProcedure.input(sendMessageSchema).mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const { data: thread, error: threadError } = await (client as any)
          .from('message_threads')
          .select('id,hotel_id,booking_id')
          .eq('id', input.thread_id)
          .maybeSingle();
        if (threadError) throw threadError;
        const threadHotelId = (thread as { hotel_id?: string } | null)?.hotel_id;
        if (!threadHotelId || threadHotelId !== input.hotel_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This thread is not available to your account.' });
        }
        const bookingId = (thread as { booking_id?: string | null } | null)?.booking_id;
        if (bookingId) {
          const { data: booking, error: bookingError } = await (client as any)
            .from('bookings')
            .select('hotel_id')
            .eq('id', bookingId)
            .maybeSingle();
          if (bookingError) throw bookingError;
          const bookingHotelId = (booking as { hotel_id?: string } | null)?.hotel_id;
          if (bookingHotelId && bookingHotelId !== input.hotel_id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Booking does not belong to this hotel.' });
          }
        }
        return await createMessage(client, {
          thread_id: input.thread_id,
          sender_user_id: ctx.user.id,
          body: input.body,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const code = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : '';
        if (code === '42P01' || /message_threads|messages.*does not exist/i.test(msg)) {
          return {
            id: '00000000-0000-4000-a000-000000000001',
            thread_id: input.thread_id,
            sender_user_id: ctx.user.id,
            body: input.body,
            created_at: new Date().toISOString(),
          } as unknown as Awaited<ReturnType<typeof createMessage>>;
        }
        return rethrowDomainError(error);
      }
    }),
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
    ota: router({
      summary: protectedProcedure.query(async ({ ctx }) => {
        requirePermission(ctx.user, 'ota.view_status');
        try {
          return await getGlobalOtaSummary(ctx.user.accessToken);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
      listConnections: protectedProcedure.input(z.object({ hotelId: z.string().uuid() })).query(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotelId, 'ota.view_status');
        try {
          return await getOtaConnections(ctx.user.accessToken, input.hotelId);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
      upsertConnection: protectedProcedure
        .input(
          z.object({
            hotelId: z.string().uuid(),
            provider: z.string().min(1),
            status: z.string().min(1),
            icalImportUrl: z.string().optional(),
            icalExportUrl: z.string().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          requireHotelPermission(ctx.user, input.hotelId, 'ota.manage_ical_connection');
          try {
            return await upsertOtaConnection(
              ctx.user.accessToken,
              input.hotelId,
              input.provider,
              input.status,
              input.icalImportUrl,
              input.icalExportUrl
            );
          } catch (error) {
            return rethrowDomainError(error);
          }
        }),
      listLogs: protectedProcedure.input(z.object({ hotelId: z.string().uuid() })).query(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotelId, 'ota.view_sync_logs');
        try {
          return await getOtaSyncLogs(ctx.user.accessToken, input.hotelId);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
      triggerSync: protectedProcedure
        .input(
          z.object({
            hotelId: z.string().uuid(),
            provider: z.string().min(1),
          })
        )
        .mutation(async ({ ctx, input }) => {
          requireHotelPermission(ctx.user, input.hotelId, 'ota.trigger_ical_sync');
          try {
            return await triggerOtaCalendarSync(ctx.user.accessToken, input.hotelId, input.provider);
          } catch (error) {
            return rethrowDomainError(error);
          }
        }),
    }),
  }),

  // ── Phase 01: SlipOK per-hotel payment settings ───────────────────────────
  slipok: router({
    /**
     * Get SlipOK integration status for a hotel.
     * Returns only { configured, enabled } — never the raw key.
     * Requires MFA step-up (AAL2 within 10 min) before revealing status.
     */
    getSettings: protectedProcedure
      .input(z.object({ hotel_id: hotelIdSchema }))
      .query(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
        requireRecentMfaVerification(ctx.user);
        const client = rlsClient(ctx.user.accessToken);
        try {
          return await getSlipOkSettings(client, input.hotel_id);
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),

    /**
     * Save a SlipOK API key + branch ID for the hotel.
     * SlipOK requires both — branch ID is sent as a URL path segment, the
     * key as the x-authorization header (see server/slipVerification.ts).
     * The key is AES-256-GCM encrypted before storage; only its hash is
     * queryable. Branch ID is not secret, stored in plaintext.
     * Requires property.manage_profile + MFA step-up.
     */
    saveKey: protectedProcedure
      .input(
        z.object({
          hotel_id: hotelIdSchema,
          api_key: z.string().trim().min(8, 'SlipOK API key is too short.').max(512),
          branch_id: z.string().trim().min(1, 'SlipOK branch ID is required.').max(128),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
        requireRecentMfaVerification(ctx.user);
        const client = rlsClient(ctx.user.accessToken);
        try {
          const encryptedKey = encryptSlipOkKey(input.api_key);
          const keyHash = hashSlipOkKey(input.api_key);
          await saveSlipOkSettings(client, input.hotel_id, encryptedKey, keyHash, input.branch_id);
          return { success: true as const };
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),

    /**
     * Remove the SlipOK key for a hotel (sets to NULL, disables).
     * Requires property.manage_profile + MFA step-up.
     */
    removeKey: protectedProcedure
      .input(z.object({ hotel_id: hotelIdSchema }))
      .mutation(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
        requireRecentMfaVerification(ctx.user);
        const client = rlsClient(ctx.user.accessToken);
        try {
          await removeSlipOkKey(client, input.hotel_id);
          return { success: true as const };
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),

    /** Save PromptPay ID and payment timeout for a hotel. */
    savePromptPayId: protectedProcedure
      .input(z.object({
        hotel_id: z.string().uuid(),
        promptpay_id: z.string().trim().min(10).max(13).regex(/^\d+$/, 'PromptPay ID must be digits only'),
        payment_timeout_minutes: z.number().int().min(5).max(60).default(15),
      }))
      .mutation(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
        const client = rlsClient(ctx.user.accessToken);
        try {
          await savePromptPaySettings(client, input.hotel_id, input.promptpay_id, input.payment_timeout_minutes);
          return { success: true as const };
        } catch (error) {
          return rethrowDomainError(error);
        }
      }),
  }),

  // ── Phase 12B: Public booking payment flow ─────────────────────────────
  payment: router({
    /**
     * Create a PromptPay QR payment session for a public booking.
     * Returns QR image URL, amount, expiresAt, and sessionId.
     * Only works if the hotel has a promptpay_id configured.
     */
    createSession: rateLimitedProcedure
      .input(z.object({
        booking_id: z.string().uuid(),
        hotel_id: z.string().uuid(),
      }))
      .mutation(async ({ input }) => {
        // Anonymous guest, no membership — must use the service-role admin
        // client (same pattern as createPublicBooking), never the RLS client:
        // payment_sessions/hotel_payment_settings/bookings all gate on
        // is_hotel_member()/can_manage_bookings(), which an anonymous caller
        // never satisfies.
        const client = createSupabaseAdminClient();
        try {
          const config = await getHotelPaymentConfig(client, input.hotel_id);
          if (!config?.promptpay_id) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'This hotel has not configured PromptPay. Please contact the hotel directly.',
            });
          }

          // Get booking amount from latest session or re-fetch
          const existingSession = await getLatestPaymentSession(client, input.booking_id);
          if (existingSession && existingSession.status === 'pending') {
            // Return existing session if still pending
            return {
              sessionId: existingSession.id,
              qrImageUrl: buildQrImageUrl(existingSession.qr_string ?? ''),
              qrString: existingSession.qr_string,
              amount: Number(existingSession.amount),
              expiresAt: existingSession.expires_at,
            };
          }

          // Fetch booking price
          const { data: booking, error: bookingError } = await client
            .from('bookings')
            .select('price')
            .eq('id', input.booking_id)
            .eq('hotel_id', input.hotel_id)
            .single();
          if (bookingError || !booking) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
          }

          const amount = Number(booking.price);
          const ref = `BK-${input.booking_id.slice(0, 8).toUpperCase()}`;
          const timeoutMs = (config.payment_timeout_minutes ?? 15) * 60 * 1000;
          const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

          const qrString = generatePromptPayQR({
            promptPayId: config.promptpay_id,
            amount,
            ref,
          });

          const session = await createPaymentSession(client, {
            booking_id: input.booking_id,
            hotel_id: input.hotel_id,
            amount,
            qr_reference: ref,
            qr_string: qrString,
            expires_at: expiresAt,
          });

          // Mark booking as pending
          await updateBookingPaymentStatus(client, input.booking_id, 'pending');

          return {
            sessionId: session.id,
            qrImageUrl: buildQrImageUrl(qrString),
            qrString,
            amount,
            expiresAt,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return rethrowDomainError(error);
        }
      }),

    /** Get the current status of a payment session. */
    checkStatus: rateLimitedProcedure
      .input(z.object({
        booking_id: z.string().uuid(),
        session_id: z.string().uuid(),
      }))
      .query(async ({ input }) => {
        const client = createSupabaseAdminClient();
        try {
          const session = await getLatestPaymentSession(client, input.booking_id);
          if (!session || session.id !== input.session_id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
          }

          // Auto-expire if past expiry time and still pending
          const now = new Date();
          const expired = now > new Date(session.expires_at);
          if (session.status === 'pending' && expired) {
            await updatePaymentSessionStatus(client, session.id, 'expired');
            await updateBookingPaymentStatus(client, session.booking_id, 'failed');
            return { status: 'expired' as const, verifiedAt: null };
          }

          return {
            status: session.status,
            verifiedAt: session.verified_at,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return rethrowDomainError(error);
        }
      }),

    /**
     * Verify a payment slip via SlipOK.
     * On success: session → paid, booking → verified.
     * On failure: session → failed, booking unchanged.
     * API key never reaches client.
     */
    verifySlip: rateLimitedProcedure
      .input(z.object({
        booking_id: z.string().uuid(),
        hotel_id: z.string().uuid(),
        session_id: z.string().uuid(),
        /** Base64 encoded slip image */
        slip_data: z.string().min(1).max(5_000_000), // ~3.7MB image limit
      }))
      .mutation(async ({ input }) => {
        const client = createSupabaseAdminClient();
        try {
          // Verify session is still pending
          const session = await getLatestPaymentSession(client, input.booking_id);
          if (!session || session.id !== input.session_id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
          }
          if (session.status !== 'pending') {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Payment session is already ${session.status}.`,
            });
          }
          if (new Date() > new Date(session.expires_at)) {
            await updatePaymentSessionStatus(client, session.id, 'expired');
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Payment session has expired.' });
          }

          // Get hotel SlipOK key + branch ID (both required — see slipVerification.ts)
          const config = await getHotelPaymentConfig(client, input.hotel_id);
          if (!config?.slipok_key_enc || !config.slipok_branch_id || !config.slipok_enabled) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Slip verification is not available for this hotel. Please contact the hotel directly.',
            });
          }

          const apiKey = decryptSlipOkKey(config.slipok_key_enc);

          const result = await verifySlipWithSlipOk(apiKey, config.slipok_branch_id, {
            slipData: input.slip_data,
            expectedAmount: Number(session.amount),
            ref: session.qr_reference,
          });

          if (result.matched) {
            const now = new Date().toISOString();
            await updatePaymentSessionStatus(client, session.id, 'paid', now);
            await updateBookingPaymentStatus(client, session.booking_id, 'verified');
            return { verified: true as const, message: 'ชำระเงินสำเร็จ' };
          } else {
            await updatePaymentSessionStatus(client, session.id, 'failed');
            await updateBookingPaymentStatus(client, session.booking_id, 'failed');
            return { verified: false as const, message: 'ไม่พบการชำระเงินที่ตรงกัน กรุณาติดต่อที่พัก' };
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          if (error instanceof SlipOkError) {
            throw new TRPCError({
              code: error.code === 'INVALID_KEY' ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
              message: error.code === 'INVALID_KEY'
                ? 'ระบบตรวจสลิปขัดข้อง กรุณาติดต่อที่พัก'
                : error.message,
            });
          }
          return rethrowDomainError(error);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
