import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import { checkAccountPassword } from '../d1/accountDeletion';
import { cancelHotelClosure, exportHotelData, listOwnClosures, requestHotelClosure } from '../d1/hotelClosure';
import { requireRecentMfaVerification } from '../mfa';
import { requireHotelPermission, rethrowDomainError } from '../routerUtils';

const hotelInput = z.object({ hotel_id: z.string().min(1) });

export const hotelClosureRouter = router({
  /** The caller's own hotels in closure. Takes no hotel id, so it shows nobody else's. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await listOwnClosures(ctx.db, ctx.caller ?? { userId: ctx.user.id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  request: protectedProcedure
    .input(hotelInput.extend({ password: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.close_hotel');
      if (!ctx.db || !ctx.auth || !ctx.headers) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in again.' });
      }
      if (ctx.user.twoFactorEnabled) requireRecentMfaVerification(ctx.user);
      try {
        await checkAccountPassword({ auth: ctx.auth, db: ctx.db, headers: ctx.headers, userId: ctx.user.id, password: input.password });
        return await requestHotelClosure(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  cancel: protectedProcedure.input(hotelInput).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.close_hotel');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await cancelHotelClosure(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** A mutation because it takes guest passport numbers off the system, so it must not be cached. */
  exportData: protectedProcedure.input(hotelInput).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.close_hotel');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    if (ctx.user.twoFactorEnabled) requireRecentMfaVerification(ctx.user);
    try {
      return await exportHotelData(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
});
