import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getSupabaseIdentity, type SupabaseIdentity } from "../supabase";

// Transport-neutral on purpose: the Express server and the Cloudflare Worker
// (worker/app.ts) both build this from their own request type.
export type TrpcContext = {
  user: SupabaseIdentity | null;
  clientIp: string;
};

export async function createContextFromRequest(
  authorization: string | null | undefined,
  clientIp: string | null | undefined
): Promise<TrpcContext> {
  let user: SupabaseIdentity | null = null;

  try {
    user = await getSupabaseIdentity(authorization);
  } catch (error) {
    console.error("[Auth] Unexpected error during getSupabaseIdentity in createContext:", error instanceof Error ? error.message : String(error));
    user = null;
  }

  return {
    user,
    clientIp: clientIp || "unknown",
  };
}

export function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return createContextFromRequest(
    opts.req.header("authorization"),
    opts.req.ip || opts.req.socket?.remoteAddress
  );
}
