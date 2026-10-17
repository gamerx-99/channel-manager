import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import { createSupabaseAdminClient } from '../supabase';
import { generatePromptPayQR, buildQrImageUrl } from '../promptpay';
import {
  DEFAULT_TRIAL_DAYS,
  PLANS,
  isOverTier,
  planForRoomCount,
} from '@shared/billing/planCatalog';
import { subscriptionDecision } from '@shared/billing/subscriptionAccess';
import {
  countHotelRooms,
  getHotelLifecycle,
  getLiveSubscription,
  getLiveSubscriptionRow,
  listPlans,
  resolveHotelBillingState,
} from '../billing/subscriptionDb';
import {
  activateSubscription,
  buildPaymentReference,
  priceCheckout,
  renewSubscription,
  setHotelSuspended,
  softDeleteHotel,
  startTrial,
} from '../billing/checkout';
import {
  requirePermission,
  requireHotelPermission,
  requireSuperAdmin,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const cycleSchema = z.enum(['monthly', 'yearly']);

/**
 * Platform PromptPay ID. Membership money lands in the platform account
 * (RONDMAP decision: the platform holds subscriptions, never a hotel's booking
 * revenue). Falls back to nothing rather than to any hotel's ID.
 *
 * ASSUMPTION: single platform PromptPay ID for now. Per-tier PromptPay IDs or a
 * SlipOK platform key would need their own settings row + ticket.
 */
function platformPromptPayId(): string {
  const id = process.env.PLATFORM_PROMPTPAY_ID ?? '';
  if (!id) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Subscription payments are not configured on this deployment.',
    });
  }
  return id;
}

export const billingRouter = router({
  /** Public plan ladder for the pricing page. Falls back to the code catalogue. */
  plans: rateLimitedProcedure.query(async () => {
    const rows = await listPlans(rlsClient());
    if (rows.length > 0) return rows;
    return PLANS.map(plan => ({
      code: plan.code,
      max_rooms: plan.maxRooms === Number.MAX_SAFE_INTEGER ? null : plan.maxRooms,
      price_monthly: plan.priceMonthly,
      price_yearly: plan.priceYearly,
      name_th: plan.nameTh,
      name_en: plan.nameEn,
      sort_order: plan.sortOrder,
    }));
  }),

  /**
   * The hotel's own billing state. Drives the dashboard banner and the
   * upgrade prompt. Existing bookings stay accessible regardless of status.
   */
  mySubscription: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
      try {
        const client = rlsClient(ctx.user.accessToken);
        const [subscription, lifecycle, rooms] = await Promise.all([
          getLiveSubscription(client, input.hotel_id),
          getHotelLifecycle(client, input.hotel_id),
          countHotelRooms(client, input.hotel_id),
        ]);
        const decision = subscriptionDecision(subscription, {
          suspendedAt: lifecycle.suspended_at,
          deletedAt: lifecycle.deleted_at,
        });
        const recommended = planForRoomCount(rooms);
        return {
          subscription,
          decision,
          room_count: rooms,
          recommended_plan: recommended.code,
          over_tier: subscription?.planCode ? isOverTier(rooms, subscription.planCode) : false,
          trial_days: DEFAULT_TRIAL_DAYS,
        };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /**
   * Price a plan and mint a PromptPay QR. The amount is computed server-side
   * from the `plans` table and the hotel's real room count — the client only
   * says WHICH plan, never how much it costs.
   */
  createCheckout: protectedProcedure
    .input(
      z.object({
        hotel_id: hotelIdSchema,
        plan_code: z.enum(['starter', 'standard', 'pro']),
        billing_cycle: cycleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
      try {
        const client = rlsClient(ctx.user.accessToken);
        const quote = await priceCheckout(client, {
          hotelId: input.hotel_id,
          planCode: input.plan_code,
          billingCycle: input.billing_cycle,
        });
        const qrString = generatePromptPayQR({
          promptPayId: platformPromptPayId(),
          amount: quote.amount,
          ref: quote.reference,
        });
        return {
          ...quote,
          qr_string: qrString,
          qr_image_url: buildQrImageUrl(qrString, 320),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  /**
   * Operator records a received subscription payment and activates the period.
   * Platform-only: tenants cannot mark their own subscription paid. Uses the
   * service-role client because subscriptions writes are is_super_admin()-
   * gated at the RLS layer and this runs from the support console.
   */
  confirmPayment: protectedProcedure
    .input(
      z.object({
        hotel_id: hotelIdSchema,
        plan_code: z.enum(['starter', 'standard', 'pro']),
        billing_cycle: cycleSchema,
        reference: z.string().trim().min(1).max(120),
        source: z.enum(['promptpay', 'slipok', 'manual']).default('manual'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_billing');
      await requireSuperAdmin(ctx.user.accessToken);
      try {
        const client = createSupabaseAdminClient();
        const existing = await getLiveSubscriptionRow(client, input.hotel_id);
        if (existing) {
          const quote = await priceCheckout(client, {
            hotelId: input.hotel_id,
            planCode: input.plan_code,
            billingCycle: input.billing_cycle,
          });
          const renewed = await renewSubscription(
            client,
            existing.id,
            input.billing_cycle,
            quote.amount,
            input.reference,
          );
          return { subscription: renewed };
        }
        const quote = await priceCheckout(client, {
          hotelId: input.hotel_id,
          planCode: input.plan_code,
          billingCycle: input.billing_cycle,
        });
        const trial = await startTrial(client, input.hotel_id, 0);
        const activated = await activateSubscription(client, {
          subscriptionId: trial.id,
          reference: input.reference,
          source: input.source,
          expectedStatus: 'trialing',
        });
        return { subscription: { ...activated, price_paid: quote.amount } };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** Open a trial for a hotel that has none. Platform-only. */
  startTrial: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema, trial_days: z.number().int().min(0).max(90).optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_billing');
      await requireSuperAdmin(ctx.user.accessToken);
      try {
        const client = createSupabaseAdminClient();
        const existing = await getLiveSubscription(client, input.hotel_id);
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This hotel already has a live subscription.',
          });
        }
        const created = await startTrial(client, input.hotel_id, input.trial_days ?? DEFAULT_TRIAL_DAYS);
        return { subscription: created };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  /** Cross-hotel subscription list for the platform support console. */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, 'platform.manage_billing');
    await requireSuperAdmin(ctx.user.accessToken);
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from('subscriptions')
        .select('id,hotel_id,plan_code,status,billing_cycle,tier_rooms,price_paid,trial_ends_at,period_start,period_end,source,reference,verified_at,cancelled_at,hotels(name,slug,suspended_at,deleted_at)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** Suspend / restore a tenant without touching its subscription row. */
  setSuspended: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema, suspended: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_hotels');
      await requireSuperAdmin(ctx.user.accessToken);
      try {
        await setHotelSuspended(createSupabaseAdminClient(), input.hotel_id, input.suspended);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /**
   * Soft delete a tenant. Never removes the row: ร.ร.4 guest data must survive
   * at least a year and bookings still reference the hotel.
   */
  softDelete: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.manage_hotels');
      await requireSuperAdmin(ctx.user.accessToken);
      try {
        await softDeleteHotel(createSupabaseAdminClient(), input.hotel_id);
        return { success: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** Re-export the billing decision for support without duplicating the rule. */
  resolveState: protectedProcedure
    .input(z.object({ hotel_id: hotelIdSchema }))
    .query(async ({ ctx, input }) => {
      requirePermission(ctx.user, 'platform.view_all_hotels');
      try {
        const state = await resolveHotelBillingState(
          createSupabaseAdminClient(),
          input.hotel_id,
          { isPlatformSuperAdmin: ctx.user.roles?.includes('super_admin') },
        );
        return state;
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});

export { buildPaymentReference };