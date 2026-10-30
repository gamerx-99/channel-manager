import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import {
  listNotifications,
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSystemNotificationsRead,
} from '../d1/notification';
import {
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ hotelId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      try {
        if (!input.hotelId) {
          if (!ctx.user.roles?.includes('super_admin') && ctx.user.role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Only Super Admins can fetch all notifications globally.' });
          }
          return await listAllNotifications(ctx.db, ctx.caller ?? { userId: ctx.user.id });
        }
        await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
        return await listNotifications(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
  markRead: protectedProcedure
    .input(z.object({ hotelId: z.string().uuid(), notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      try {
        await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
        return await markNotificationRead(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.notificationId, input.hotelId);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
  markAllRead: protectedProcedure
    .input(z.object({ hotelId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      try {
        if (!input.hotelId) {
          if (!ctx.user.roles?.includes('super_admin') && ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
          await markSystemNotificationsRead(ctx.db, ctx.caller ?? { userId: ctx.user.id });
          return { success: true };
        }
        await requireHotelPermission(ctx.user, input.hotelId, 'property.view');
        await markAllNotificationsRead(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId);
        return { success: true };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
