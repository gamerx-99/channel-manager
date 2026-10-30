import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { hasHotelPermission } from '@shared/authorization';
import {
  getIdentityRoles,
  requirePermission,
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';
import {
  listOtaConnections,
  upsertOtaConnection,
  deleteOtaConnection,
  listOtaSyncLogs,
  getOtaSummary,
  triggerOtaCalendarSyncD1,
} from '../d1/ota';
import { ICAL_URL_ERROR, isPublicIcalUrl } from '../icalUrl';

export const otaRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) throw new Error('D1 database required.');
    try {
      return await getOtaSummary(ctx.db, ctx.caller ?? { userId: ctx.user.id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
  listConnections: protectedProcedure.input(z.object({ hotelId: z.string().uuid() })).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, 'ota.view_status');
    if (!ctx.db) throw new Error('D1 database required.');
    try {
      const includeExportUrl = hasHotelPermission(
        getIdentityRoles(ctx.user),
        ctx.user.memberships ?? [],
        input.hotelId,
        'ota.manage_ical_connection',
      );
      return await listOtaConnections(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, { includeExportUrl });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
  upsertConnection: protectedProcedure
    .input(
      z.object({
        hotelId: z.string().uuid(),
        provider: z.string().trim().min(1).max(50),
        status: z.enum(['active', 'disconnected']),
        icalImportUrl: z.string().trim().refine(isPublicIcalUrl, ICAL_URL_ERROR).optional(),
        roomId: z.string().uuid().nullable().optional(),
        roomTypeId: z.string().uuid().nullable().optional(),
      }).refine(data => !(data.roomId && data.roomTypeId), {
        message: 'Choose either a room or a room type, not both.',
        path: ['roomTypeId'],
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotelId, 'ota.manage_ical_connection');
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        const includeExportUrl = hasHotelPermission(
          getIdentityRoles(ctx.user),
          ctx.user.memberships ?? [],
          input.hotelId,
          'ota.manage_ical_connection',
        );
        return await upsertOtaConnection(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
          hotelId: input.hotelId,
          provider: input.provider,
          status: input.status,
          icalImportUrl: input.icalImportUrl,
          roomId: input.roomId,
          roomTypeId: input.roomTypeId,
          includeExportUrl,
        });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
  listLogs: protectedProcedure.input(z.object({ hotelId: z.string().uuid() })).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotelId, 'ota.view_sync_logs');
    if (!ctx.db) throw new Error('D1 database required.');
    try {
      return await listOtaSyncLogs(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
  deleteConnection: protectedProcedure
    .input(
      z.object({
        hotelId: z.string().uuid(),
        provider: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotelId, 'ota.manage_ical_connection');
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        await deleteOtaConnection(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, input.provider);
        return { success: true };
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
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        return await triggerOtaCalendarSyncD1(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, input.provider);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
