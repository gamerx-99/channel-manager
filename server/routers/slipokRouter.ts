import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { getSlipOkSettings, saveSlipOkSettings, removeSlipOkKey, savePromptPaySettings } from '../db';
import { encryptSlipOkKey, hashSlipOkKey } from '../slipokCrypto';
import { rethrowDomainError, requireHotelPermission, rlsClient } from '../routerUtils';
import { requireRecentMfaVerification } from '../mfa';

const hotelIdSchema = z.string().uuid();

export const slipokRouter = router({
  /**
   * Get SlipOK integration status for a hotel.
   * Returns only { configured, enabled } — never the raw key.
   * Requires MFA step-up (AAL2 within 10 min) before revealing status.
   */
  getSettings: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      const client = rlsClient(ctx.user.accessToken);
      try {
        return await getSlipOkSettings(client, input.hotel_id);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /**
   * Save a SlipOK API key + branch ID for the hotel.
   * SlipOK requires both — branch ID is sent as a URL path segment, the
   * key as the x-authorization header (see server/slipVerification.ts).
   * The key is AES-256-GCM encrypted before storage; only its hash is
   * queryable. Branch ID is not secret, stored in plaintext.
   * Requires property.manage_profile + MFA step-up.
   */
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
      const client = rlsClient(ctx.user.accessToken);
      try {
        const encryptedKey = await encryptSlipOkKey(input.api_key);
        const keyHash = await hashSlipOkKey(input.api_key);
        await saveSlipOkSettings(client, input.hotel_id, encryptedKey, keyHash, input.branch_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /**
   * Remove the SlipOK key for a hotel (sets to NULL, disables).
   * Requires property.manage_profile + MFA step-up.
   */
  removeKey: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      const client = rlsClient(ctx.user.accessToken);
      try {
        await removeSlipOkKey(client, input.hotel_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** Save PromptPay ID and payment timeout for a hotel. */
  savePromptPayId: protectedProcedure
    .input(z.object({
      hotel_id: z.string().uuid(),
      promptpay_id: z.string().trim().min(10).max(13).regex(/^\d+$/, 'PromptPay ID must be digits only'),
      payment_timeout_minutes: z.number().int().min(5).max(60).default(15),
    }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      requireRecentMfaVerification(ctx.user);
      const client = rlsClient(ctx.user.accessToken);
      try {
        await savePromptPaySettings(client, input.hotel_id, input.promptpay_id, input.payment_timeout_minutes);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
