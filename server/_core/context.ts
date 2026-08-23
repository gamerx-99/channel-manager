import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getSupabaseIdentity, type SupabaseIdentity } from "../supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: SupabaseIdentity | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: SupabaseIdentity | null = null;

  try {
    user = await getSupabaseIdentity(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
