import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import { createSupabaseAdminClient } from '../supabase';
import {
  listNotifications,
  listAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSystemNotificationsRead,
} from '../db';
import {
  requireHotelPermission,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

export const notificationsRouter = router({
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
});
