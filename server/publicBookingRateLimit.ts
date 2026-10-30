import { TRPCError } from "@trpc/server";

/** The part of the Workers `RateLimit` binding (PUBLIC_BOOKING_LIMITER in wrangler.toml) this app uses. */
export type PublicBookingLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type PublicBookingRateLimitContext = {
  publicBookingLimiter?: PublicBookingLimiter;
  /** CF-Connecting-IP as set by Cloudflare's edge. */
  cfConnectingIp?: string | null;
};

/**
 * Counts one public booking write against PUBLIC_BOOKING_LIMITER, keyed by the caller's
 * CF-Connecting-IP, and rejects with TOO_MANY_REQUESTS once the binding says no. This sits on
 * top of rateLimitedProcedure's per-isolate counter and the D1 active-holds-per-IP guard,
 * which both keep working unchanged.
 */
export async function enforcePublicBookingRateLimit(ctx: PublicBookingRateLimitContext): Promise<void> {
  const limiter = ctx.publicBookingLimiter;
  const ip = ctx.cfConnectingIp?.trim();
  // Without the binding (tests, local tools) the endpoints behave as before.
  // ASSUMPTION: Cloudflare's edge always sets CF-Connecting-IP, so a request without it did not
  // come through the edge; it is not counted rather than sharing one bucket with every such call.
  if (!limiter || !ip) return;

  let outcome: { success: boolean };
  try {
    outcome = await limiter.limit({ key: ip });
  } catch (error) {
    // ASSUMPTION: a failing binding falls back to the older limits instead of blocking bookings.
    console.error("[PublicBookingRateLimit] limiter failed:", error instanceof Error ? error.message : error);
    return;
  }
  if (!outcome.success) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many booking requests from this IP, please try again later.",
    });
  }
}
