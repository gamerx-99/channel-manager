import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmBookingDetails: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock("./d1/booking", () => ({ confirmBookingDetails: mocks.confirmBookingDetails }));
vi.mock("./email", () => ({ createEmailSender: () => ({ sendEmail: mocks.sendEmail }) }));

import { bookingRouter } from "./routers/bookingRouter";

describe("public booking payment email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmBookingDetails.mockResolvedValue({
      booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      status: "pending_payment",
      amount: "1200.00",
    });
    mocks.sendEmail.mockResolvedValue({ id: "mail-1", success: true });
  });

  it("emails the guest a return-to-payment link after confirming details", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ slug: "demo-hotel", name: "Demo Hotel" }] }) }) }),
    } as any;
    const caller = bookingRouter.createCaller({
      req: { url: "https://www.hayhostth.com/api/trpc/channelManager.confirmBookingDetails" } as Request,
      user: null,
      db,
    } as never);

    await caller.confirmBookingDetails({
      booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      guest_name: "Test Guest",
      guest_email: "guest@example.com",
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "guest@example.com",
      text: expect.stringContaining("https://www.hayhostth.com/demo-hotel/book?booking_id=88ed76e4-cc93-4aa7-9c4d-30999d35ada4&hotel_id=11111111-1111-4111-8111-111111111111"),
    }));
  });
});
