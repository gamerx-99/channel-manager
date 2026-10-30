import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import {
  getSlipOkSettings,
  saveSlipOkSettings,
  removeSlipOkKey,
  savePromptPaySettings,
} from '../d1/payment';
import { encryptSlipOkKey, hashSlipOkKey } from '../slipokCrypto';
import { rethrowDomainError, requireHotelPermission } from '../routerUtils';
import { requireRecentMfaVerification } from '../mfa';

const hotelIdSchema = z.string().uuid();

export const slipokRouter = router({
  getSettings: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        return await getSlipOkSettings(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  saveKey: protectedProcedure
    .input(
      z.object({
        hotel_id: hotelIdSchema,
        api_key: z.string().trim().min(8, 'SlipOK API key is too short.').max(512),
        branch_id: z.string().trim().min(1, 'SlipOK branch ID is required.').max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        const encryptedKey = await encryptSlipOkKey(input.api_key);
        const keyHash = await hashSlipOkKey(input.api_key);
        await saveSlipOkSettings(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, encryptedKey, keyHash, input.branch_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  removeKey: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        await removeSlipOkKey(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  savePromptPayId: protectedProcedure
    .input(z.object({
      hotel_id: z.string().uuid(),
      promptpay_id: z.string().trim().min(10).max(13).regex(/^\d+$/, 'PromptPay ID must be digits only'),
      payment_timeout_minutes: z.number().int().min(5).max(60).default(15),
    }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      if (!ctx.db) throw new Error('D1 database required.');
      try {
        await savePromptPaySettings(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.promptpay_id, input.payment_timeout_minutes);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
