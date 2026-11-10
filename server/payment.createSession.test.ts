import { beforeEach, describe, expect, it, vi } from "vitest";

const payment = vi.hoisted(() => ({
  getHotelPaymentConfig: vi.fn(), getLatestPaymentSession: vi.fn(), createPaymentSession: vi.fn(), updateBookingPaymentStatus: vi.fn(),
}));
const bookingOps = vi.hoisted(() => ({ expireBookingIfPast: vi.fn() }));
vi.mock("./d1/payment", () => payment);
vi.mock("./d1/booking", () => bookingOps);

import { paymentRouter } from "./routers/paymentRouter";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";

function makeDb(status: string, paymentStatus: string) {
  const booking = { id: BOOKING, hotelId: HOTEL, status, paymentStatus, price: "120.00" };
  const db = {
    select: () => {
      let isHotelJoin = false;
      const chain: any = {
        innerJoin: () => { isHotelJoin = true; return chain; },
        where: () => chain,
        limit: async () => isHotelJoin ? [{ hotelId: HOTEL, publicEnabled: true }] : [booking],
      };
      return { from: (_table: unknown) => chain };
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  return db;
}

function caller(db: unknown, candidateEnabled = true) {
  return paymentRouter.createCaller({ db, user: null, clientIp: "create-session-test", billingEnv: candidateEnabled ? { BILLING_CANDIDATE_ENABLED: "true" } : undefined } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  payment.getHotelPaymentConfig.mockResolvedValue({ promptpay_id: "0812345678", payment_timeout_minutes: 15 });
  payment.getLatestPaymentSession.mockResolvedValue(null);
  payment.createPaymentSession.mockResolvedValue({ id: "session-1", qr_string: "qr", amount: "120.00", expires_at: "2099-01-01T00:00:00.000Z" });
  payment.updateBookingPaymentStatus.mockResolvedValue(undefined);
  bookingOps.expireBookingIfPast.mockResolvedValue({ status: "pending_payment" });
});

describe("payment.createSession full-payment guard", () => {
  it("refuses a second QR after a confirmed booking is verified paid", async () => {
    const app = caller(makeDb("confirmed", "verified"));
    await expect(app.createSession({ booking_id: BOOKING, hotel_id: HOTEL })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(payment.createPaymentSession).not.toHaveBeenCalled();
  });

  it("still permits a confirmed booking whose payment is not verified", async () => {
    const app = caller(makeDb("confirmed", "unpaid"));
    await expect(app.createSession({ booking_id: BOOKING, hotel_id: HOTEL })).resolves.toMatchObject({ amount: 120 });
    expect(payment.createPaymentSession).toHaveBeenCalledOnce();
  });

  it("preserves the baseline session behavior for a verified booking while the candidate is off", async () => {
    const app = caller(makeDb("confirmed", "verified"), false);
    await expect(app.createSession({ booking_id: BOOKING, hotel_id: HOTEL })).resolves.toMatchObject({ amount: 120 });
    expect(payment.createPaymentSession).toHaveBeenCalledOnce();
  });
});
