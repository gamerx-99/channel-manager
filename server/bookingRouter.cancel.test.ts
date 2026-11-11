import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cancelHotelBooking: vi.fn() }));
vi.mock("./db/scope", async importOriginal => ({ ...(await importOriginal<typeof import("./db/scope")>()), cancelHotelBooking: mocks.cancelHotelBooking }));

import { appRouter } from "./routers";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const BOOKING = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";

function callerWith(permissions: string[]) {
  const user = {
    id: "staff-1", email: "staff@example.test", name: "Staff", roles: [], accessToken: "t", session: {},
    memberships: [{ hotelId: HOTEL, role: "front_desk", permissions }],
  };
  return appRouter.createCaller({ req: {} as Request, user, db: {} as never, caller: { userId: "staff-1" } } as never);
}

beforeEach(() => {
  mocks.cancelHotelBooking.mockReset();
  mocks.cancelHotelBooking.mockResolvedValue({ id: BOOKING });
});

describe("channelManager.cancelBooking (owner decision 5.3)", () => {
  it("needs a reason of 3 to 500 characters", async () => {
    const app = callerWith(["operations.cancel_bookings"]);
    for (const reason of ["", "  ", "ab", "x".repeat(501)]) {
      await expect(app.channelManager.cancelBooking({ hotel_id: HOTEL, booking_id: BOOKING, reason })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect((app.channelManager.cancelBooking as (input: unknown) => Promise<unknown>)({ hotel_id: HOTEL, booking_id: BOOKING })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.cancelHotelBooking).not.toHaveBeenCalled();
  });

  it("cancels with the trimmed reason", async () => {
    const app = callerWith(["operations.cancel_bookings"]);
    await expect(app.channelManager.cancelBooking({ hotel_id: HOTEL, booking_id: BOOKING, reason: "  Guest asked to cancel  " })).resolves.toEqual({ id: BOOKING });
    expect(mocks.cancelHotelBooking).toHaveBeenCalledWith({}, { userId: "staff-1" }, HOTEL, BOOKING, expect.any(Date), "Guest asked to cancel");
  });

  it("is refused without the cancel permission", async () => {
    const app = callerWith(["operations.manage_checkin_checkout"]);
    await expect(app.channelManager.cancelBooking({ hotel_id: HOTEL, booking_id: BOOKING, reason: "Guest asked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.cancelHotelBooking).not.toHaveBeenCalled();
  });
});
