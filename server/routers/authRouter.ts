import { publicProcedure, router } from '../_core/trpc';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    const { accessToken: _accessToken, ...rest } = ctx.user;
    return rest;
  }),
  logout: publicProcedure.mutation(() => ({ success: true as const })),
});
