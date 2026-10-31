import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { savePromptPaySettings } from '../d1/payment';
import { rethrowDomainError, requireHotelPermission } from '../routerUtils';
import { requireRecentMfaVerification } from '../mfa';

// Slip checks use one central SlipOK account (spec 14-05), so hotels only set
// where guests pay.
export const slipokRouter = router({
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
