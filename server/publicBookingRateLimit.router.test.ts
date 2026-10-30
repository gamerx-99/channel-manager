import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ holdRoomType: vi.fn(), confirmBookingDetails: vi.fn() }));
vi.mock("./d1/booking", () => mocks);
import { appRouter } from "./routers";

const publicCaller = { userId: "", roles: [], access: "public" as const };
const holdInput = {
  slug: "demo-hotel",
  room_type_id: "f1a1b1c1-d1e1-41f1-81f1-111111111111",
  check_in: "2026-12-01",
  check_out: "2026-12-02",
  adults: 2,
  children: [],
};
const confirmInput = {
  booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4",
  hotel_id: "11111111-1111-4111-8111-111111111111",
  guest_name: "Test Guest",
};

function callerWith(success: boolean) {
  const limit = vi.fn().mockResolvedValue({ success });
  const app = appRouter.createCaller({
    user: null,
    clientIp: "203.0.113.9",
    db: {} as any,
    caller: publicCaller,
    publicBookingLimiter: { limit },
    cfConnectingIp: "203.0.113.9",
  });
  return { app, limit };
}

beforeEach(() => vi.resetAllMocks());

describe("PUBLIC_BOOKING_LIMITER on public booking writes", () => {
  it("passes holdRoomType and confirmBookingDetails through when the binding allows them", async () => {
    const { app, limit } = callerWith(true);
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: confirmInput.booking_id });
    mocks.confirmBookingDetails.mockResolvedValueOnce({ status: "pending_payment" });

    await expect(app.channelManager.holdRoomType(holdInput)).resolves.toEqual({ booking_id: confirmInput.booking_id });
    await expect(app.channelManager.confirmBookingDetails(confirmInput)).resolves.toEqual({ status: "pending_payment" });
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("rejects both with TOO_MANY_REQUESTS before touching D1 when the binding refuses", async () => {
    const { app } = callerWith(false);

    await expect(app.channelManager.holdRoomType(holdInput)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(app.channelManager.confirmBookingDetails(confirmInput)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.holdRoomType).not.toHaveBeenCalled();
    expect(mocks.confirmBookingDetails).not.toHaveBeenCalled();
  });

  it("keeps the D1 active-holds guard: the hold IP hash still reaches the repository", async () => {
    const { app } = callerWith(true);
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: confirmInput.booking_id });

    await app.channelManager.holdRoomType(holdInput);
    expect(mocks.holdRoomType).toHaveBeenCalledWith(
      {},
      publicCaller,
      expect.objectContaining({ createdIpHash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
  });
});
