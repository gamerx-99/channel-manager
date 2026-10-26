import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Basic in-memory rate limiter for TRPC public endpoints (per instance/isolate).
const rlStore: Record<string, { count: number; resetTime: number }> = {};
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let nextPruneAt = 0;

// Pruned lazily on request: Workers forbid timers at module scope.
function pruneExpired(now: number) {
  if (now < nextPruneAt) return;
  nextPruneAt = now + PRUNE_INTERVAL_MS;
  for (const ip in rlStore) {
    if (rlStore[ip].resetTime < now) delete rlStore[ip];
  }
}

const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const ip = ctx.clientIp || "unknown";
  const now = Date.now();
  pruneExpired(now);
  const windowMs = 60 * 1000; // 1 minute
  const max = 20; // 20 requests per minute

  if (!rlStore[ip]) {
    rlStore[ip] = { count: 0, resetTime: now + windowMs };
  }
  const record = rlStore[ip];
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  record.count++;
  if (record.count > max) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests from this IP, please try again later.",
    });
  }
  return next({ ctx });
});

export const rateLimitedProcedure = t.procedure.use(rateLimitMiddleware);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.appMetadata.role !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
