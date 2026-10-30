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
} from '../d1/staff';
import {
  inviteStaffUser as d1InviteStaffUser,
  acceptStaffInvite as d1AcceptStaffInvite,
} from '../d1/invites';
import {
  createSignupLink as d1CreateSignupLink,
  listSignupLinksForHotel as d1ListSignupLinksForHotel,
  getValidSignupLink as d1GetValidSignupLink,
  redeemSignupLink as d1RedeemSignupLink,
  createHotelOwnerMembership as d1CreateHotelOwnerMembership,
} from '../d1/signupLinks';
import { createEmailSender } from '../email';
import {
  requirePermission,
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const adminUserIdSchema = z.string().uuid();
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

// adminUsers: platform-level, requires Better Auth user listing (Stage 3). Temporarily returns empty.
export const adminUsers = protectedProcedure.query(async ({ ctx }) => {
  requirePermission(ctx.user, 'platform.manage_users');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const assignments = await listHotelUserAssignments(ctx.db, ctx.caller ?? { userId: ctx.user.id });
    return { users: [], assignments };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const hotelStaff = protectedProcedure.input(hotelStaffListSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return {
      hotel: { id: input.hotel_id, name: '' },
      staff: await listHotelStaff(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, []),
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listHotelAdminAuditLogs = protectedProcedure.input(hotelAdminAuditLogListSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await dbListHotelAdminAuditLogs(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.limit);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const inviteHotelStaff = protectedProcedure.input(hotelStaffInviteSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const emailSender = createEmailSender();
    return await d1InviteStaffUser(
      ctx.db,
      ctx.caller ?? { userId: ctx.user.id },
      emailSender,
      input,
    );
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
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1CreateSignupLink(
      ctx.db,
      ctx.caller ?? { userId: ctx.user.id },
      input,
    );
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listSignupLinks = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'platform.manage_signup_links');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1ListSignupLinksForHotel(
      ctx.db,
      ctx.caller ?? { userId: ctx.user.id },
      input.hotel_id,
    );
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const validateSignupLink = rateLimitedProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ ctx, input }) => {
  if (!ctx.db) return { valid: false as const };
  const link = await d1GetValidSignupLink(ctx.db, input.token);
  if (!link) return { valid: false as const };
  return { valid: true as const, hotelName: link.hotelName };
});

export const completeHotelOwnerSignup = rateLimitedProcedure.input(z.object({
  token: z.string().min(1),
})).mutation(async ({ ctx, input }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required to complete signup.' });
  }
  const userId = ctx.user.id;
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  const redeemed = await d1RedeemSignupLink(ctx.db, input.token, userId);
  if (!redeemed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This signup link is no longer valid.' });
  }
  try {
    await d1CreateHotelOwnerMembership(ctx.db, redeemed.hotel_id, userId);
  } catch (error) {
    return rethrowDomainError(error);
  }
  return { success: true as const };
});

export const acceptStaffInvite = rateLimitedProcedure.input(z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  name: z.string().optional(),
})).mutation(async ({ ctx, input }) => {
  if (!ctx.db) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required for accepting invites.' });
  }
  return await d1AcceptStaffInvite(ctx.db, input);
});

export const updateHotelStaffRole = protectedProcedure.input(hotelStaffRoleSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_staff');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const caller = ctx.caller ?? { userId: ctx.user.id };
    const assignments = await listHotelUserAssignments(ctx.db, caller);
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
    const updated = await updateHotelUserAssignmentRole(ctx.db, caller, {
      membership_id: input.membership_id,
      hotel_id: input.hotel_id,
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
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const caller = ctx.caller ?? { userId: ctx.user.id };
    const assignments = await listHotelUserAssignments(ctx.db, caller);
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
    if (isPlatformRole(targetRole)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a human hotel staff member can receive Hotel Admin access.' });
    }
    const transferred = await dbTransferHotelAdmin(ctx.db, caller, {
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
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const caller = ctx.caller ?? { userId: ctx.user.id };
    const assignments = await listHotelUserAssignments(ctx.db, caller);
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
    const removed = await deleteHotelUserAssignment(ctx.db, caller, input.membership_id);
    if (!removed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel staff membership could not be removed.' });
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
  acceptStaffInvite,
  updateHotelStaffRole,
  transferHotelAdmin,
  removeHotelStaff,
});
