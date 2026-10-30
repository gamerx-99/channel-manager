import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { requireHotelPermission, requirePermission, rethrowDomainError } from "../routerUtils";
import { disableSupportAccount, findSupportUserIdByEmail, grantSupportAccess, inviteSupportAccount, listSupportAccess, listSupportAccounts, revokeSupportAccess } from "../d1/supportAccess";
import { createEmailSender } from "../email";
import { listPlatformHotelSummaries, updateHotelStaffPermissions } from "../db/scope";
import { PERMISSIONS } from "@shared/authorization";

const hotelInput = z.object({ hotelId: z.string().uuid() });
// Better Auth ids need not be UUIDs. Treat them as opaque identifiers.
const userId = z.string().trim().min(1).max(256);
const email = z.string().trim().email("Enter a valid email address.").max(320).transform(value => value.toLowerCase());
export const accessRouter = router({
  updateStaffPermissions: protectedProcedure.input(hotelInput.extend({
    targetUserId: userId, permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, "property.manage_staff");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await updateHotelStaffPermissions(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, input.targetUserId, input.permissions); }
    catch (error) { return rethrowDomainError(error); }
  }),
  grantSupport: protectedProcedure.input(hotelInput.extend({
    supportEmail: email, durationHours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]), mode: z.enum(["view", "edit"]),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, "property.manage_support_access");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try {
      const supportUserId = await findSupportUserIdByEmail(ctx.db, input.supportEmail);
      return await grantSupportAccess(ctx.db, ctx.caller ?? { userId: ctx.user.id }, { hotelId: input.hotelId, supportUserId, durationHours: input.durationHours, mode: input.mode });
    }
    catch (error) { return rethrowDomainError(error); }
  }),
  inviteSupportAccount: protectedProcedure.input(z.object({ email })).mutation(async ({ ctx, input }) => {
    requirePermission(ctx.user, "platform.manage_users");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await inviteSupportAccount(ctx.db, ctx.caller ?? { userId: ctx.user.id }, createEmailSender(), input); }
    catch (error) { return rethrowDomainError(error); }
  }),
  supportAccounts: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "platform.manage_users");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await listSupportAccounts(ctx.db, ctx.caller ?? { userId: ctx.user.id }); }
    catch (error) { return rethrowDomainError(error); }
  }),
  disableSupportAccount: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    requirePermission(ctx.user, "platform.manage_users");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await disableSupportAccount(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.id); }
    catch (error) { return rethrowDomainError(error); }
  }),
  revokeSupport: protectedProcedure.input(hotelInput.extend({ grantId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, "property.manage_support_access");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await revokeSupportAccess(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, input.grantId); }
    catch (error) { return rethrowDomainError(error); }
  }),
  supportAccess: protectedProcedure.input(hotelInput).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, "property.manage_support_access");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await listSupportAccess(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId); }
    catch (error) { return rethrowDomainError(error); }
  }),
  platformSummary: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "platform.view_system_logs");
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await listPlatformHotelSummaries(ctx.db, ctx.caller ?? { userId: ctx.user.id }); }
    catch (error) { return rethrowDomainError(error); }
  }),
});
