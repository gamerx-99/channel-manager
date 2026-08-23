import { z } from 'zod';
import { hasAnyPermission, roleHasPermission, type AppRole, type HumanRole, type Permission } from '@shared/authorization';
import { TM30_HEADERS } from './tm30';
import { getOtaConnections, getGlobalOtaSummary, getUpdatedItemCount, upsertOtaConnection, getOtaSyncLogs, triggerOtaCalendarSync } from './otaSync';
import { TRPCError } from '@trpc/server';
import {
  createManagedHotel,
  createManagedRoomType,
  updateManagedRoomType,
  deleteManagedRoomType,
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
  isSuperAdmin,
  listAvailabilityForHotel,
  listBookingsForHotel,
  listManagedHotels,
  updateAvailability,
} from './db';
import { systemRouter } from './_core/systemRouter';
import { protectedProcedure, publicProcedure, router } from './_core/trpc';
import {
  createRlsSupabaseClient,
  deleteAuthUser,
  getAuthUser,
  inviteAuthUser,
  listAuthUsers,
} from './supabase';
import { buildTm30Rows, createTm30Workbook } from './tm30';
import { buildChannelPerformanceSummary } from './channelPerformance';

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
});
const updateRoomTypeSchema = createRoomTypeSchema.extend({ room_type_id: z.string().uuid() });
const deleteRoomTypeSchema = z.object({ hotel_id: hotelIdSchema, room_type_id: z.string().uuid() });
const adminUserIdSchema = z.string().uuid();
const adminUserRoleSchema = z.enum(['super_admin', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping']);
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

function addIsoDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}


function rlsClient(accessToken?: string) {
  return createRlsSupabaseClient(accessToken);
}

function getIdentityRoles(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }) {
  return user.roles?.length ? user.roles : user.role ? [user.role] : [];
}

function requirePermission(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }, permission: Permission) {
  if (!hasAnyPermission(getIdentityRoles(user), permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission: ${permission}` });
  }
}

function requireHotelPermission(
  user: { id: string; role?: AppRole | null; roles?: readonly AppRole[] | null; memberships?: readonly { hotelId: string; role: AppRole }[] | null },
  hotelId: string,
  permission: Permission,
) {
  const roles = getIdentityRoles(user);
  const memberships = user.memberships ?? [];
  const allowed = roles.includes('super_admin') || memberships.some(
    membership => membership.hotelId === hotelId && roleHasPermission(membership.role, permission),
  );
  if (!allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission for hotel: ${permission}` });
  }
}

async function requireSuperAdmin(accessToken: string) {
  const client = rlsClient(accessToken);
  if (!(await isSuperAdmin(client))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super administrators can manage users.' });
  }
  return client;
}

function assertSingleHotelAdmin(
  assignments: Array<{ id: string; hotel_id: string; role: AppRole }>,
  hotelId: string,
  membershipId?: string,
) {
  const hasOtherHotelAdmin = assignments.some(
    assignment => assignment.hotel_id === hotelId
      && assignment.role === 'hotel_owner'
      && assignment.id !== membershipId,
  );
  if (hasOtherHotelAdmin) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This hotel already has one Hotel Admin. Reassign the existing Hotel Admin before assigning another.',
    });
  }
}

function rethrowDomainError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Unexpected database error';
  if (message.startsWith('23P01:')) {
    throw new TRPCError({ code: 'CONFLICT', message: 'The selected room already has an overlapping booking.' });
  }
  if (message.startsWith('42501:')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this hotel.' });
  }
  if (message.startsWith('P0002:')) {
    throw new TRPCError({ code: 'NOT_FOUND', message: message.replace(/^P0002:\s*/, '') });
  }
  if (message.startsWith('23505:')) {
    throw new TRPCError({ code: 'CONFLICT', message: 'A hotel or room type with the same unique details already exists.' });
  }
  if (message.startsWith('23514:') || message.startsWith('22P02:')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'The submitted values are not valid for this record.' });
  }
  if (message.includes('TM.30') || message.startsWith('Booking ')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

export const appRouter = router({
  system: systemRouter,
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        }
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        }
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        }
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
        if (targetRole === 'super_admin' || targetRole === 'api_service') {
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        }
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
        const [user, hotel] = await Promise.all([
          getAuthUser(input.user_id),
          getManagedHotel(client, input.hotel_id),
        ]);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'The selected Auth user was not found.' });
        if (!hotel) throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
        }
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel || !hotel.room_types.some(roomType => roomType.id === input.room_type_id)) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type is not available to your account.' });
        }
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
        const hotel = await getManagedHotel(client, input.hotel_id);
        if (!hotel || !hotel.room_types.some(roomType => roomType.id === input.room_type_id)) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type is not available to your account.' });
        }
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
      }))
      .mutation(async ({ ctx, input }) => {
        requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
        if (input.check_out <= input.check_in) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Check-out must be later than check-in.' });
        }
        try {
          const { guests, ...booking } = input;
          return await createBookingWithGuests(
            rlsClient(ctx.user.accessToken),
            booking,
            guests.map(guest => ({
              ...guest,
              middle_name: guest.middle_name ?? null,
              gender: guest.gender ?? null,
              phone_no: guest.phone_no ?? null,
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
            const hotel = await getManagedHotel(client, input.hotel_id);
            if (!hotel || !hotel.room_types.some(roomType => roomType.id === input.room_type_id)) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type is not available to your account.' });
            }
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
    publicHotel: publicProcedure.input(z.string().trim().min(1).max(100)).query(async ({ input }) => {
      try {
        return await getPublicHotel(rlsClient(), input);
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
});

export type AppRouter = typeof appRouter;
