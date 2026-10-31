import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { checkMfaStepUpStatus } from '../mfa';
import { verifyMfaStepUp } from '../mfaStepUp';
import { rethrowDomainError } from '../routerUtils';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    const { accessToken: _accessToken, session: _session, ...rest } = ctx.user;
    return rest;
  }),
  logout: publicProcedure.mutation(() => ({ success: true as const })),

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
});
