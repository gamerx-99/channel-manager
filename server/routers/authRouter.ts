import { publicProcedure, router } from '../_core/trpc';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  logout: publicProcedure.mutation(() => ({ success: true as const })),
});
