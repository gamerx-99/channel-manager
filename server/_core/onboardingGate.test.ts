import { describe, expect, it } from "vitest";
import { protectedProcedure, router, isAllowedBeforeGate } from "./trpc";
import type { TrpcContext } from "./context";

const app = router({
  auth: router({ me: protectedProcedure.query(() => "me"), acceptTerms: protectedProcedure.mutation(() => "accepted") }),
  hotel: router({ registerOwnHotel: protectedProcedure.mutation(() => "created") }),
  channelManager: router({ hotels: protectedProcedure.query(() => []), bookings: protectedProcedure.query(() => []) }),
});

function callerFor(pendingGate: "add_real_email" | "accept_terms" | null | undefined) {
  const ctx = {
    user: { id: "u1", email: "owner@example.com", name: "Owner", accessToken: "t", appMetadata: {}, userMetadata: {}, memberships: [], pendingGate },
    clientIp: "127.0.0.1",
  } as unknown as TrpcContext;
  return app.createCaller(ctx);
}

describe("first-use gates on the server", () => {
  it("refuses hotel work from a LINE/Facebook account that has not added a real email", async () => {
    await expect(callerFor("add_real_email").hotel.registerOwnHotel()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("add_real_email").auth.me()).resolves.toBe("me");
  });

  it("refuses hotel work from an owner who has not accepted the terms, but lets them accept", async () => {
    await expect(callerFor("accept_terms").channelManager.bookings()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("accept_terms").auth.acceptTerms()).resolves.toBe("accepted");
    await expect(callerFor("accept_terms").channelManager.hotels()).resolves.toEqual([]);
  });

  it("lets a finished account through", async () => {
    await expect(callerFor(null).hotel.registerOwnHotel()).resolves.toBe("created");
    await expect(callerFor(undefined).channelManager.bookings()).resolves.toEqual([]);
  });

  it("allows only account procedures and the hotel list before the gate", () => {
    expect(isAllowedBeforeGate("auth.addRealEmail")).toBe(true);
    expect(isAllowedBeforeGate("channelManager.hotels")).toBe(true);
    expect(isAllowedBeforeGate("hotel.registerOwnHotel")).toBe(false);
    expect(isAllowedBeforeGate("payment.manualVerify")).toBe(false);
  });
});
