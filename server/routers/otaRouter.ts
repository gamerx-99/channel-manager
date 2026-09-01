import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import {
  requirePermission,
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';
import {
  getOtaConnections,
  getGlobalOtaSummary,
  upsertOtaConnection,
  deleteOtaConnection,
  getOtaSyncLogs,
  triggerOtaCalendarSync,
} from '../otaSync';

export const otaRouter = router({
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
  deleteConnection: protectedProcedure
    .input(
      z.object({
        hotelId: z.string().uuid(),
        provider: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotelId, 'ota.manage_ical_connection');
      try {
        await deleteOtaConnection(ctx.user.accessToken, input.hotelId, input.provider);
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
      try {
        return await triggerOtaCalendarSync(ctx.user.accessToken, input.hotelId, input.provider);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
