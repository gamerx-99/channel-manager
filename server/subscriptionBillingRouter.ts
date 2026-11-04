import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { coupons, couponRedemptions, hotelSubscriptions, subscriptionPayments } from "../drizzle/d1-schema";
import { protectedProcedure, router } from "./_core/trpc";
import { rethrowDomainError } from "./routerUtils";
import { getHotelBillingState } from "./db/scope";
import { authorizeHotelAction } from "./db/scope";
import { assertSlipPaymentMatch, transitionSubscriptionPayment } from "./subscriptionPayments";
import { CouponError, extendPaidUntil, quotePro, TRIAL_DAYS } from "../shared/plans";
import { moneyToSatang, satangToMoney } from "./db/money";
import { generatePromptPayQR } from "./promptpay";
import { verifySlipWithSlipOk } from "./slipVerification";
import { hasHotelPermission } from "../shared/authorization";

const hotelIdSchema = z.string().uuid();
const monthsSchema = z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]);
const missingSecrets = () => new TRPCError({ code: "PRECONDITION_FAILED", message: "Subscription payment system is not ready. Please contact hayhost." });

function requireOwnerBilling(ctx: { user: { id: string; role?: any; roles?: any[]; memberships?: any[] }; caller?: { userId: string; access?: string; roles?: readonly any[] } }, hotelId: string) {
  const ownerMembership = ctx.user.memberships?.find(m => m.hotelId === hotelId && m.role === "hotel_owner");
  // ASSUMPTION: hotel billing is a hotel_owner-only action; platform administrators use CRM tools and do not pay a hotel's subscription.
  if (ctx.user.roles?.includes("super_admin") || ctx.user.roles?.includes("admin") || ctx.user.roles?.includes("support")
    || !ctx.caller || ctx.caller.userId !== ctx.user.id || !ownerMembership
    || !hasHotelPermission([], [ownerMembership], hotelId, "property.manage_billing")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Missing permission: property.manage_billing" });
  }
}

async function couponQuote(ctx: { db: NonNullable<import("./_core/context").TrpcContext["db"]>; caller?: import("./db/scope").D1CallerContext; user: { id: string } }, input: { hotelId: string; months: number; couponCode?: string }, now = new Date()) {
  await authorizeHotelAction(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, "property.view", "subscription.quote", now);
  const code = input.couponCode?.trim().toUpperCase();
  const [coupon] = code ? await ctx.db.select().from(coupons).where(eq(coupons.code, code)).limit(1) : [];
  if (code && !coupon) throw new TRPCError({ code: "BAD_REQUEST", message: "Coupon code is invalid." });
  const redemptionCount = coupon ? Number((await ctx.db.select({ count: sql<number>`count(*)` }).from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id)))[0]?.count ?? 0) : 0;
  const redeemed = coupon ? Boolean((await ctx.db.select({ id: couponRedemptions.id }).from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.hotelId, input.hotelId))).limit(1))[0]) : false;
  let quote;
  try {
    quote = quotePro({ months: input.months, coupon: coupon ? { percentOff: coupon.percentOff, discountMonths: coupon.discountMonths, active: coupon.active,
      expiresAt: coupon.expiresAt, maxRedemptions: coupon.maxRedemptions, redemptionCount } : null, now, alreadyRedeemed: redeemed });
  } catch (error) {
    if (error instanceof CouponError) throw new TRPCError({ code: "BAD_REQUEST", message: error.code });
    throw error;
  }
  return { ...quote, couponId: coupon?.id ?? null, couponCode: coupon?.code ?? null };
}

export const subscriptionBillingRouter = router({
  state: protectedProcedure.input(z.object({ hotelId: hotelIdSchema })).query(async ({ ctx, input }) => {
    requireOwnerBilling(ctx, input.hotelId);
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await getHotelBillingState(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId); }
    catch (error) { return rethrowDomainError(error); }
  }),
  quote: protectedProcedure.input(z.object({ hotelId: hotelIdSchema, months: monthsSchema, couponCode: z.string().trim().max(80).optional() })).query(async ({ ctx, input }) => {
    requireOwnerBilling(ctx, input.hotelId);
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    try { return await couponQuote(ctx as any, input); }
    catch (error) { return rethrowDomainError(error); }
  }),
  createPayment: protectedProcedure.input(z.object({ hotelId: hotelIdSchema, months: monthsSchema, couponCode: z.string().trim().max(80).optional() })).mutation(async ({ ctx, input }) => {
    requireOwnerBilling(ctx, input.hotelId);
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    const now = new Date();
    try {
      const quote = await couponQuote(ctx as any, input, now);
      const isFree = moneyToSatang(String(quote.amount)) === BigInt(0);
      // A paid payment needs the platform PromptPay ID (QR) and SlipOK keys (slip check).
      // The QR payload is EMVCo text; the client draws it locally with client/src/lib/qr.ts.
      if (!isFree && (!ctx.billingEnv?.PLATFORM_PROMPTPAY_ID || !ctx.billingEnv.SLIPOK_API_KEY || !ctx.billingEnv.SLIPOK_BRANCH_ID)) throw missingSecrets();
      const id = crypto.randomUUID();
      const qrExpiresAt = isFree ? null : new Date(now.getTime() + 15 * 60_000);
      if (isFree) {
        const billing = await getHotelBillingState(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, now);
        const paidUntil = extendPaidUntil({ paidUntil: billing.plan === "pro" ? billing.endsAt : null, trialEndsAt: billing.trialEndsAt, now, months: input.months });
        const statements = [
          ctx.db.insert(subscriptionPayments).values({ id, hotelId: input.hotelId, months: input.months, listAmount: satangToMoney(moneyToSatang(String(quote.listAmount))), discountAmount: satangToMoney(moneyToSatang(String(quote.discountAmount))), amount: "0.00", couponId: quote.couponId, status: "verified", createdByUserId: ctx.user.id, verifiedAt: now }),
          ctx.db.insert(hotelSubscriptions).values({ hotelId: input.hotelId, paidUntil, updatedAt: now }).onConflictDoUpdate({ target: hotelSubscriptions.hotelId, set: { paidUntil, updatedAt: now } }),
        ];
        if (quote.couponId) statements.push(ctx.db.insert(couponRedemptions).values({ couponId: quote.couponId, hotelId: input.hotelId, paymentId: id, createdAt: now }) as any);
        await ctx.db.batch(statements as any);
        return { paymentId: id, status: "verified" as const, qr: null, qrExpiresAt: null, paidUntil };
      }
      await ctx.db.insert(subscriptionPayments).values({ id, hotelId: input.hotelId, months: input.months, listAmount: satangToMoney(moneyToSatang(String(quote.listAmount))), discountAmount: satangToMoney(moneyToSatang(String(quote.discountAmount))), amount: satangToMoney(moneyToSatang(String(quote.amount))), couponId: quote.couponId, status: "pending", qrExpiresAt, createdByUserId: ctx.user.id });
      return { paymentId: id, status: "pending" as const, qr: generatePromptPayQR({ promptPayId: ctx.billingEnv!.PLATFORM_PROMPTPAY_ID!, amount: quote.amount, ref: id.replaceAll("-", "").slice(0, 25) }), qrExpiresAt, paidUntil: null };
    } catch (error) { return rethrowDomainError(error); }
  }),
  verifySlip: protectedProcedure.input(z.object({ hotelId: hotelIdSchema, paymentId: z.string().uuid(), slipData: z.string().min(1).max(6_500_000) })).mutation(async ({ ctx, input }) => {
    requireOwnerBilling(ctx, input.hotelId);
    if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
    if (!ctx.billingEnv?.SLIPOK_API_KEY || !ctx.billingEnv.SLIPOK_BRANCH_ID || !ctx.billingEnv.PLATFORM_PROMPTPAY_ID) throw missingSecrets();
    try {
      const payment = (await ctx.db.select().from(subscriptionPayments).where(and(eq(subscriptionPayments.id, input.paymentId), eq(subscriptionPayments.hotelId, input.hotelId))).limit(1))[0];
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
      if (payment.status !== "pending") transitionSubscriptionPayment(payment.status as any, "verify_success");
      if (!payment.qrExpiresAt || payment.qrExpiresAt.getTime() <= Date.now()) {
        await ctx.db.update(subscriptionPayments).set({ status: transitionSubscriptionPayment("pending", "expire") }).where(and(eq(subscriptionPayments.id, payment.id), eq(subscriptionPayments.status, "pending")));
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment QR has expired." });
      }
      const result = await verifySlipWithSlipOk({ apiKey: ctx.billingEnv.SLIPOK_API_KEY, branchId: ctx.billingEnv.SLIPOK_BRANCH_ID }, { slipData: input.slipData, expectedAmount: Number(payment.amount) });
      const ref = assertSlipPaymentMatch({ matched: result.matched, amount: result.amount, expectedAmount: Number(payment.amount), transactionRef: result.transactionRef });
      const now = new Date();
      const billing = await getHotelBillingState(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotelId, now);
      const paidUntil = extendPaidUntil({ paidUntil: billing.plan === "pro" ? billing.endsAt : null, trialEndsAt: billing.trialEndsAt, now, months: payment.months });
      // The batch is one transaction, but a 0-row UPDATE does not stop the next statements.
      // Every later statement therefore only acts when THIS request's update won: the payment
      // row is verified with this request's own verified_at. A concurrent second verify of the
      // same payment then extends nothing and redeems nothing.
      const nowMs = now.getTime();
      const wonThisVerify = sql`exists (select 1 from subscription_payments where id = ${payment.id} and status = 'verified' and verified_at = ${nowMs} and slip_trans_ref = ${ref})`;
      const statements = [
        ctx.db.update(subscriptionPayments).set({ status: transitionSubscriptionPayment("pending", "verify_success"), slipTransRef: ref, verifiedAt: now }).where(and(eq(subscriptionPayments.id, payment.id), eq(subscriptionPayments.status, "pending"))),
        ctx.db.run(sql`insert into hotel_subscriptions (hotel_id, paid_until, updated_at)
          select ${input.hotelId}, ${paidUntil.getTime()}, ${nowMs} where ${wonThisVerify}
          on conflict(hotel_id) do update set paid_until = excluded.paid_until, updated_at = excluded.updated_at`),
      ];
      if (payment.couponId) statements.push(ctx.db.run(sql`insert into coupon_redemptions (id, coupon_id, hotel_id, payment_id, created_at)
          select ${crypto.randomUUID()}, ${payment.couponId}, ${input.hotelId}, ${payment.id}, ${nowMs} where ${wonThisVerify}`) as any);
      const results = await ctx.db.batch(statements as any);
      if (results[0]?.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "Payment is no longer pending." });
      return { status: "verified" as const, paidUntil };
    } catch (error) { return rethrowDomainError(error); }
  }),
});
