import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "sample@example.com",
    name: "Sample User",
    accessToken: "sample-supabase-access-token",
    appMetadata: {},
    userMetadata: {},
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("acknowledges a client-owned Supabase logout without touching legacy server cookies", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
  });
});
