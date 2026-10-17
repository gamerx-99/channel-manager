import { z } from 'zod';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import { getCancellationPolicy, saveCancellationPolicy } from '../db';
import { getPolicyValidationError } from '@shared/cancellationPolicy';
import {
  requireHotelPermission,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();

const policyFields = {
  free_cancellation_days: z.number().int().min(0).max(365),
  partial_keep_percent: z.number().min(0).max(100),
  partial_cutoff_days: z.number().int().min(0).max(365),
  deposit_percent: z.number().min(0).max(100),
  no_show_keep_percent: z.number().min(0).max(100),
  policy_text_th: z.string().trim().min(1).max(5000),
  policy_text_en: z.string().trim().min(1).max(5000),
};

/** Get the hotel's current cancellation policy (staff view). */
export const getPolicy = protectedProcedure
  .input(z.object({ hotel_id: hotelIdSchema }))
  .query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
    try {
      return await getCancellationPolicy(rlsClient(ctx.user.accessToken), input.hotel_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

/** Public read for the booking wizard: show policy before payment. */
export const getPublicPolicy = rateLimitedProcedure
  .input(z.object({ hotel_id: hotelIdSchema }))
  .query(async ({ input }) => {
    try {
      return await getCancellationPolicy(rlsClient(), input.hotel_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

/** Create/replace the hotel's policy (version auto-bumps). */
export const savePolicy = protectedProcedure
  .input(z.object({ hotel_id: hotelIdSchema, ...policyFields }))
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
    const { hotel_id, ...fields } = input;
    if (fields.partial_cutoff_days > fields.free_cancellation_days) {
      const { TRPCError } = await import('@trpc/server');
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'partial_cutoff_days cannot be later than free_cancellation_days.' });
    }
    const precheck = getPolicyValidationError({ ...fields, version: 1 });
    if (precheck) {
      const { TRPCError } = await import('@trpc/server');
      throw new TRPCError({ code: 'BAD_REQUEST', message: precheck });
    }
    try {
      return await saveCancellationPolicy(rlsClient(ctx.user.accessToken), hotel_id, fields);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const cancellationPolicyRouter = router({
  getPolicy,
  getPublicPolicy,
  savePolicy,
});
