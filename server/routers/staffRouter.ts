import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import {
  isPlatformRole,
  type AppRole,
  type HumanRole,
} from '@shared/authorization';
import {
  listHotelUserAssignments,
  listHotelStaff,
  listHotelAdminAuditLogs as dbListHotelAdminAuditLogs,
  createHotelUserAssignment,
  deleteHotelUserAssignment,
  updateHotelUserAssignmentRole,
  transferHotelAdmin as dbTransferHotelAdmin,
  getManagedHotel,
} from '../db';
import {
  listAuthUsers,
  inviteAuthUser,
  deleteAuthUser,
  getAuthUser,
  createHotelOwnerMembership,
  createSignupLink as dbCreateSignupLink,
  listSignupLinksForHotel,
  getValidSignupLink,
  redeemSignupLink,
} from '../supabase';
import { generateSignupToken, deriveSignupLinkStatus } from '../signupLinks';
import {
  requirePermission,
  requireHotelPermission,
  requireSuperAdmin,
  assertSingleHotelAdmin,
  assertHotelExists,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const adminUserIdSchema = z.string().uuid();
// `support` is stored only once the spec 14 migration widens the hotel_users role check.
const adminUserRoleSchema = z.enum(['super_admin', 'admin', 'support', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping']);
const adminUserEmailSchema = z.string().trim().email('Enter a valid email address.').max(320).transform(email => email.toLowerCase());

export const assignUserSchema = z.object({
  user_id: adminUserIdSchema,
  hotel_id: hotelIdSchema,
  role: adminUserRoleSchema,
});

export const inviteUserSchema = z.object({
  email: adminUserEmailSchema,
  hotel_id: hotelIdSchema,
  role: adminUserRoleSchema,
});

export const removeMembershipSchema = z.object({ membership_id: adminUserIdSchema });

export const hotelStaffListSchema = z.object({ hotel_id: hotelIdSchema });
export const hotelStaffRoleValueSchema = z.enum(['hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping']);

export const hotelStaffInviteSchema = z.object({
  hotel_id: hotelIdSchema,
  email: adminUserEmailSchema,
  role: hotelStaffRoleValueSchema,
});

export const hotelStaffRoleSchema = z.object({
  hotel_id: hotelIdSchema,
  membership_id: adminUserIdSchema,
  role: hotelStaffRoleValueSchema,
});

export const hotelStaffRemoveSchema = z.object({
  hotel_id: hotelIdSchema,
  membership_id: adminUserIdSchema,
});

export const hotelStaffTransferSchema = z.object({
  hotel_id: hotelIdSchema,
  target_membership_id: adminUserIdSchema,
});

export const hotelAdminAuditLogListSchema = z.object({
  hotel_id: hotelIdSchema,
  limit: z.number().int().min(1).max(100).default(50),
});

export const adminUsers = protectedProcedure.query(async ({ ctx }) => {
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
});

export const hotelStaff = protectedProcedure.input(hotelStaffListSchema).query(async ({ ctx, input }) => {
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
});

export const listHotelAdminAuditLogs = protectedProcedure.input(hotelAdminAuditLogListSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
  const client = rlsClient(ctx.user.accessToken);
  try {
    const hotel = await assertHotelExists(client, input.hotel_id);
    return await dbListHotelAdminAuditLogs(client, input.hotel_id, input.limit);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const inviteHotelStaff = protectedProcedure.input(hotelStaffInviteSchema).mutation(async ({ ctx, input }) => {
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
});

export const createSignupLink = protectedProcedure.input(z.object({
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
    return await dbCreateSignupLink(input.hotel_id, ctx.user.id, token, expiresAt);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listSignupLinks = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'platform.manage_signup_links');
  try {
    const links = await listSignupLinksForHotel(input.hotel_id);
    return links.map(link => ({ ...link, status: deriveSignupLinkStatus(link) }));
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const validateSignupLink = rateLimitedProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ input }) => {
  const link = await getValidSignupLink(input.token);
  if (!link) return { valid: false as const };
  return { valid: true as const, hotelName: link.hotelName };
});

export const completeHotelOwnerSignup = rateLimitedProcedure.input(z.object({
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
});

export const updateHotelStaffRole = protectedProcedure.input(hotelStaffRoleSchema).mutation(async ({ ctx, input }) => {
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
});

export const transferHotelAdmin = protectedProcedure.input(hotelStaffTransferSchema).mutation(async ({ ctx, input }) => {
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
    const transferred = await dbTransferHotelAdmin(client, {
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
});

export const removeHotelStaff = protectedProcedure.input(hotelStaffRemoveSchema).mutation(async ({ ctx, input }) => {
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
});

export const inviteAdminUser = protectedProcedure.input(inviteUserSchema).mutation(async ({ ctx, input }) => {
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
});

export const assignAdminUser = protectedProcedure.input(assignUserSchema).mutation(async ({ ctx, input }) => {
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
});

export const removeAdminMembership = protectedProcedure.input(removeMembershipSchema).mutation(async ({ ctx, input }) => {
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
});

export const staffRouter = router({
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
});
