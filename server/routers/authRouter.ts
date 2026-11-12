import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, publicProcedure, rateLimitedProtectedProcedure, router } from '../_core/trpc';
import { assertNotBlocked, checkAccountPassword, deleteOwnAccount, getAccountDeletionBlockers } from '../d1/accountDeletion';
import { getAccountProfile } from '../d1/accountProfile';
import { acceptOwnerTerms, getTermsAcceptedAt } from '../d1/ownerTerms';
import { confirmRealEmail, discardSocialSignup, requestRealEmail, socialEmailMatch, useSocialEmail } from '../socialEmail';
import { resolveAppUrl } from '../appUrl';
import { checkMfaStepUpStatus, requireRecentMfaVerification } from '../mfa';
import { verifyMfaStepUp } from '../mfaStepUp';
import { rethrowDomainError } from '../routerUtils';
import { enabledSocialProviders } from '../socialAuth';
import { userOnboarding } from '../../drizzle/d1-schema';
import { eq } from 'drizzle-orm';

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const { accessToken: _accessToken, session: _session, ...rest } = ctx.user;
    // Hotel owners must have accepted the platform terms before using the app (owner decision, 2026-11-11).
    const termsAcceptedAt = ctx.db ? await getTermsAcceptedAt(ctx.db, ctx.user.id) : null;
    return { ...rest, termsAcceptedAt };
  }),

  /** A LINE / Facebook account with a placeholder email asks for a confirmation link to its real address (decision 2026-11-11). */
  addRealEmail: rateLimitedProtectedProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email().max(254) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Auth is not available.' });
      try {
        const appUrl = resolveAppUrl(ctx.publicAppUrl ?? (ctx.req?.url ? new URL(ctx.req.url).origin : undefined));
        return await requestRealEmail({ auth: ctx.auth, userId: ctx.user.id, newEmail: input.email, appUrl });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** The signed-in account opens the link from addRealEmail; only the account that asked for it can use it. */
  confirmRealEmail: rateLimitedProtectedProcedure
    .input(z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Auth is not available.' });
      try {
        return await confirmRealEmail({ auth: ctx.auth, userId: ctx.user.id, token: input.token });
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** What the Facebook email of this new account matches: nothing, a free address, or an existing account. */
  socialEmailMatch: rateLimitedProtectedProcedure.query(async ({ ctx }) => {
    if (!ctx.auth) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Auth is not available.' });
    try {
      return await socialEmailMatch({ auth: ctx.auth, userId: ctx.user.id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** Takes the Facebook email for this account when it is free. */
  useSocialEmail: rateLimitedProtectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.auth) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Auth is not available.' });
    try {
      return await useSocialEmail({ auth: ctx.auth, userId: ctx.user.id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** Removes the just-made placeholder account, so the person can sign in to the account they already have. */
  discardSocialSignup: rateLimitedProtectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.auth) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Auth is not available.' });
    try {
      return await discardSocialSignup({ auth: ctx.auth, userId: ctx.user.id, hasHotels: (ctx.user.memberships ?? []).length > 0 });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** The signed-in account accepts the platform terms. Idempotent: the first acceptance time is kept. */
  acceptTerms: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return { termsAcceptedAt: await acceptOwnerTerms(ctx.db, ctx.user.id) };
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
  logout: publicProcedure.mutation(() => ({ success: true as const })),

  /** The signed-in account's own personal information, linked sign-in methods and owned hotels with their plans. */
  profile: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await getAccountProfile(ctx.db, ctx.caller ?? { userId: ctx.user.id }, ctx.user.id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    const [row] = await ctx.db.select().from(userOnboarding).where(eq(userOnboarding.userId, ctx.user.id)).limit(1);
    return { tourCompletedAt: row?.tourCompletedAt ?? null, tourSkippedAt: row?.tourSkippedAt ?? null };
  }),
  setOnboardingTourState: protectedProcedure.input(z.object({ state: z.enum(['completed', 'skipped', 'reset']) })).mutation(async ({ ctx, input }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    const now = new Date();
    const [row] = await ctx.db.insert(userOnboarding).values({ userId: ctx.user.id, tourCompletedAt: input.state === 'completed' ? now : null, tourSkippedAt: input.state === 'skipped' ? now : null, updatedAt: now }).onConflictDoUpdate({ target: userOnboarding.userId, set: { tourCompletedAt: input.state === 'completed' ? now : null, tourSkippedAt: input.state === 'skipped' ? now : null, updatedAt: now } }).returning();
    return { tourCompletedAt: row.tourCompletedAt, tourSkippedAt: row.tourSkippedAt };
  }),

  /** Names only, so the sign-in pages can hide a provider that has no credentials yet. */
  socialProviders: publicProcedure.query(() => enabledSocialProviders(process.env)),

  /** Whether this session may do an action that needs a recent authenticator code. */
  mfaStepUpStatus: protectedProcedure.query(({ ctx }) => {
    const result = checkMfaStepUpStatus(ctx.user);
    return { status: result.status, expiresAtMs: result.expiresAtMs };
  }),

  /** Check an authenticator code for this session and open the step-up window. */
  verifyMfaStepUp: protectedProcedure
    .input(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }))
    .mutation(async ({ ctx, input }) => {
      const sessionId = (ctx.user.session as { id?: unknown } | undefined)?.id;
      if (!ctx.db || !ctx.auth || !ctx.headers || typeof sessionId !== 'string') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in again.' });
      }
      if (!ctx.user.twoFactorEnabled) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Set up an authenticator app first.' });
      }
      try {
        await verifyMfaStepUp({ auth: ctx.auth, db: ctx.db, headers: ctx.headers, sessionId, userId: ctx.user.id, code: input.code });
        return { verified: true as const };
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),

  /** What stops this account being deleted, so the page can explain before asking for a password. */
  accountDeletionStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await getAccountDeletionBlockers(ctx.db, ctx.caller ?? { userId: ctx.user.id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  /** Deletes the caller's own account. It takes no user id, so it can never reach anyone else's. */
  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string().min(1).max(256), confirmEmail: z.string().trim().max(320) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db || !ctx.auth || !ctx.headers) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in again.' });
      }
      if (input.confirmEmail.toLowerCase() !== ctx.user.email?.toLowerCase()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The email does not match this account.' });
      }
      if (ctx.user.twoFactorEnabled) requireRecentMfaVerification(ctx.user);
      const caller = ctx.caller ?? { userId: ctx.user.id };
      try {
        assertNotBlocked(await getAccountDeletionBlockers(ctx.db, caller));
        await checkAccountPassword({ auth: ctx.auth, db: ctx.db, headers: ctx.headers, userId: ctx.user.id, password: input.password });
        return await deleteOwnAccount(ctx.db, caller);
      } catch (error) {
        return rethrowDomainError(error);
      }
    }),
});
