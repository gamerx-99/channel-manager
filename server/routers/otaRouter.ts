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
  getOtaConnections,
  getGlobalOtaSummary,
  upsertOtaConnection,
  deleteOtaConnection,
  getOtaSyncLogs,
  triggerOtaCalendarSync,
} from '../otaSync';
import { ICAL_URL_ERROR, isPublicIcalUrl } from '../icalUrl';

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
      // The export URL is a credential for the room's calendar; only managers see it.
      const includeExportUrl = hasHotelPermission(
        getIdentityRoles(ctx.user),
        ctx.user.memberships ?? [],
        input.hotelId,
        'ota.manage_ical_connection',
      );
      return await getOtaConnections(ctx.user.accessToken, input.hotelId, { includeExportUrl });
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
          input.roomId
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
