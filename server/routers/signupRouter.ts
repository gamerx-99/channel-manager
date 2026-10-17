import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import { createSupabaseAdminClient, createRlsSupabaseClient } from '../supabase';
import { startTrial } from '../billing/checkout';

/**
 * Public self-signup: a visitor creates their own hotel in one step.
 *
 * Security notes (the P1-4 finding on the invite-token flow, applied here from
 * the start):
 *  - The caller must already hold a session; the hotel owner is ALWAYS
 *    ctx.user.id. A client-supplied userId is never trusted.
 *  - The slug is derived server-side from the hotel name and de-duplicated, so
 *    a new tenant cannot claim another hotel's public URL.
 *  - The trial subscription row is created in the same call, so a tenant is
 *    never born already blocked by the billing gate.
 */

export function slugifyHotelName(name: string): string {
  // Thai hotel names are the common case, so the slug keeps Thai letters and
  // digits rather than collapsing "โรงแรมสุขใจ" to an empty string. Written
  // without a /u unicode-property escape because tsconfig targets pre-ES6.
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^฀-๿a-z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Appends -2, -3 … until the slug is free. Takes a predicate rather than a
 * client so the rule stays a pure, testable function.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const seed = base || 'hotel';
  if (!(await isTaken(seed))) return seed;
  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${seed}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Pathological case only; the random suffix keeps signup working.
  return `${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

export const signupRouter = router({
/**
   * Create the hotel, bind the caller as its owner, and open the trial.
   *
   * Uses the service-role client for the two writes because the RLS policies
   * are intentionally platform-only (hotels_insert_platform, and hotel_users
   * writes now exclude self-assigned platform roles — see
   * 20261017_hotel_users_role_escalation_guard.sql). Scope is exactly two
   * inserts: one hotels row and one hotel_users row for ctx.user.id.
   */
  createHotel: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, 'Hotel name is required.').max(160),
        address: z.string().trim().min(1, 'Address is required.').max(500),
        owner_contact: z.string().trim().min(1, 'Contact is required.').max(180),
        trial_days: z.number().int().min(0).max(90).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createSupabaseAdminClient();
      try {
        const slug = await uniqueSlug(slugifyHotelName(input.name), async candidate => {
          const { data } = await admin
            .from('hotels')
            .select('id')
            .eq('slug', candidate)
            .maybeSingle();
          return Boolean(data);
        });

        const { data: hotel, error: hotelError } = await admin
          .from('hotels')
          .insert({
            name: input.name,
            slug,
            address: input.address,
            owner_contact: input.owner_contact,
            // New tenants start unpublished: the owner switches the site on once
            // rooms and photos exist, instead of launching an empty page.
            public_enabled: false,
          })
          .select('id,name,slug,address,public_enabled')
          .single();
        if (hotelError) throw hotelError;

        const { error: membershipError } = await admin
          .from('hotel_users')
          .insert({ hotel_id: hotel.id, user_id: ctx.user.id, role: 'hotel_owner' });
        if (membershipError) throw membershipError;

        const subscription = await startTrial(admin, hotel.id, input.trial_days ?? 14);

        // Read back through the REQUEST-SCOPED client so the response reflects
        // what RLS will actually let this user see on the next request.
        const verify = await createRlsSupabaseClient(ctx.user.accessToken)
          .from('hotels')
          .select('id,name,slug,address,public_enabled')
          .eq('id', hotel.id)
          .maybeSingle();

        return {
          hotel: verify.data ?? hotel,
          subscription: {
            status: subscription.status,
            plan_code: subscription.plan_code,
            trial_ends_at: subscription.trial_ends_at,
            period_end: subscription.period_end,
          },
        };
      } catch (error) {
        return rethrow(error);
      }
    }),
});

function rethrow(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : 'Unexpected database error';
  if (message.startsWith('42501:')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this hotel.' });
  }
  if (message.includes('duplicate key')) {
    throw new TRPCError({ code: 'CONFLICT', message: 'That name is already taken. Please try another.' });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}