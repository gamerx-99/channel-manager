import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { assertNotBlocked, checkAccountPassword, deleteOwnAccount, getAccountDeletionBlockers } from '../d1/accountDeletion';
import { checkMfaStepUpStatus, requireRecentMfaVerification } from '../mfa';
import { verifyMfaStepUp } from '../mfaStepUp';
import { rethrowDomainError } from '../routerUtils';
import { enabledSocialProviders } from '../socialAuth';
import { userOnboarding } from '../../drizzle/d1-schema';
import { eq } from 'drizzle-orm';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    const { accessToken: _accessToken, session: _session, ...rest } = ctx.user;
    return rest;
  }),
  logout: publicProcedure.mutation(() => ({ success: true as const })),

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
