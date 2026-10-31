import { afterEach, describe, expect, it, vi } from "vitest";
import { enforcePublicBookingRateLimit } from "./publicBookingRateLimit";

afterEach(() => vi.restoreAllMocks());

describe("enforcePublicBookingRateLimit", () => {
  it("lets the request through and keys the binding by CF-Connecting-IP", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });

    await expect(
      enforcePublicBookingRateLimit({ publicBookingLimiter: { limit }, cfConnectingIp: "203.0.113.7" }),
    ).resolves.toBeUndefined();
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
  });

  it("rejects with TOO_MANY_REQUESTS when the binding is over its limit", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });

    await expect(
      enforcePublicBookingRateLimit({ publicBookingLimiter: { limit }, cfConnectingIp: "203.0.113.7" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does nothing without the binding", async () => {
    await expect(enforcePublicBookingRateLimit({ cfConnectingIp: "203.0.113.7" })).resolves.toBeUndefined();
  });

  it("does not count requests that carry no CF-Connecting-IP", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });

    await expect(enforcePublicBookingRateLimit({ publicBookingLimiter: { limit } })).resolves.toBeUndefined();
    await expect(
      enforcePublicBookingRateLimit({ publicBookingLimiter: { limit }, cfConnectingIp: "  " }),
    ).resolves.toBeUndefined();
    expect(limit).not.toHaveBeenCalled();
  });

  it("falls back to the older limits when the binding throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const limit = vi.fn().mockRejectedValue(new Error("binding unavailable"));

    await expect(
      enforcePublicBookingRateLimit({ publicBookingLimiter: { limit }, cfConnectingIp: "203.0.113.7" }),
    ).resolves.toBeUndefined();
  });
});
