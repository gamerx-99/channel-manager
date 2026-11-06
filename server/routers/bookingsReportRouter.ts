import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '../_core/trpc';
import { requireFinancialsAccess, requireHotelPermission, rethrowDomainError } from '../routerUtils';
import { financialsInputSchema } from '../financials';
import { buildBookingsReport } from '../bookingsReport';
import { listBookingsReportData } from '../d1/bookingsReport';

export const bookingsReport = protectedProcedure.input(z.object({
  hotelId: z.string().uuid(),
  period: financialsInputSchema,
  basis: z.enum(['stay', 'created']).default('stay'),
})).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotelId, 'reports.view_bookings');
  let includeMoney = true;
  try {
    requireFinancialsAccess(ctx.user, input.hotelId);
  } catch (error) {
    if (!(error instanceof TRPCError) || error.code !== 'FORBIDDEN') throw error;
    includeMoney = false;
  }
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const data = await listBookingsReportData(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId);
    return buildBookingsReport({ ...data, period: input.period, basis: input.basis, includeMoney });
  } catch (error) {
    return rethrowDomainError(error);
  }
});
