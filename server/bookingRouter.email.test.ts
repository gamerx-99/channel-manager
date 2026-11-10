import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmBookingDetails: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock("./d1/booking", () => ({ confirmBookingDetails: mocks.confirmBookingDetails }));

import { bookingRouter } from "./routers/bookingRouter";

// The guest's "booking received" mail is now a durable, de-duplicated event sent by
// the booking repository (server/d1/booking.ts, covered by bookingEmail.delivery.test.ts).
// The router must hand it the mail sender and the site origin, and must not send a
// second mail of its own.
describe("public booking payment email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmBookingDetails.mockResolvedValue({
      booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      status: "pending_payment",
      amount: "1200.00",
    });
  });

  it("hands the mail sender and site origin to the booking repository and sends nothing itself", async () => {
    const emailSender = { sendEmail: mocks.sendEmail };
    const caller = bookingRouter.createCaller({
      req: { url: "https://www.hayhostth.com/api/trpc/channelManager.confirmBookingDetails" } as Request,
      user: null,
      db: {} as any,
      emailSender,
    } as never);

    await caller.confirmBookingDetails({
      booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      guest_name: "Test Guest",
      guest_email: "guest@example.com",
    });

    expect(mocks.confirmBookingDetails).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ guest_email: "guest@example.com" }),
      expect.any(Date), emailSender, "https://www.hayhostth.com",
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
