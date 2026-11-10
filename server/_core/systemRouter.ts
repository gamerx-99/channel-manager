import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { isBillingCandidateEnabled } from "@shared/billingCandidate";

export const systemRouter = router({
  billingCandidateEnabled: publicProcedure.query(({ ctx }) =>
    isBillingCandidateEnabled(ctx.billingEnv?.BILLING_CANDIDATE_ENABLED),
  ),
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});
