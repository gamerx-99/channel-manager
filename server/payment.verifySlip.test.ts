import { beforeEach, describe, expect, it, vi } from "vitest";

const payment = vi.hoisted(() => ({
  getHotelPaymentConfig: vi.fn(),
  getSlipOkCredentialsForVerification: vi.fn(),
  getLatestPaymentSession: vi.fn(),
  createPaymentSession: vi.fn(),
  updateBookingPaymentStatus: vi.fn(),
  updatePaymentSessionStatus: vi.fn(),
  finalizePaymentSession: vi.fn(),
}));
const booking = vi.hoisted(() => ({ expireBookingIfPast: vi.fn(), logBookingStatusChange: vi.fn() }));
const verify = vi.hoisted(() => vi.fn());

vi.mock("./d1/payment", () => payment);
vi.mock("./d1/booking", () => booking);
vi.mock("./slipokCrypto", () => ({ decryptSlipOkKey: vi.fn(async () => "key") }));
vi.mock("./slipVerification", async importOriginal => ({ ...(await importOriginal<typeof import("./slipVerification")>()), verifySlipWithSlipOk: verify }));

import { SlipOkError } from "./slipVerification";
import { paymentRouter } from "./routers/paymentRouter";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const HOLD_EXPIRES = new Date("2099-01-01T00:00:00.000Z");

function fakeDb(rejectedRows: unknown[] = [{ id: BOOKING }], published = true) {
  const writes: Array<Record<string, unknown>> = [];
  const selectChain: any = { from: () => selectChain, innerJoin: () => selectChain, where: () => selectChain, limit: async () => [{ id: BOOKING, hotelId: HOTEL, publicEnabled: published, status: "pending_payment", expiresAt: HOLD_EXPIRES }] };
  const db = {
    select: () => selectChain,
    update: () => ({
      set(values: Record<string, unknown>) {
        writes.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => rejectedRows }) };
      },
    }),
  };
  return { db, writes };
}

const submit = (db: unknown, index: number) => paymentRouter
  .createCaller({ db, clientIp: `verify-slip-${index}`, user: null } as never)
  .verifySlip({ booking_id: BOOKING, session_id: SESSION, slip_data: "c2xpcA==" });

beforeEach(() => {
  vi.clearAllMocks();
  payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", qr_reference: "ref", expires_at: "2099-01-01T00:00:00.000Z" });
  payment.getSlipOkCredentialsForVerification.mockResolvedValue({ slipok_key_enc: "enc", slipok_branch_id: "branch" });
  booking.expireBookingIfPast.mockResolvedValue({ status: "pending_payment" });
});

describe("verifySlip outcomes", () => {
  it("refuses a booking on an unpublished hotel", async () => {
    await expect(submit(fakeDb(undefined, false).db, 4)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("restores the status and room hold when the image is unreadable", async () => {
    verify.mockRejectedValueOnce(new SlipOkError("unreadable", "UNREADABLE_SLIP"));
    const { db, writes } = fakeDb();

    await expect(submit(db, 1)).resolves.toMatchObject({ verified: false, retrySlip: true });

    expect(writes.at(-1)).toEqual({ status: "pending_payment", expiresAt: HOLD_EXPIRES });
    expect(payment.finalizePaymentSession).not.toHaveBeenCalled();
  });

  it("rejects a refused slip and closes the session", async () => {
    verify.mockResolvedValueOnce({ matched: false, transactionRef: null, amount: null, raw: { code: 1014 } });
    const { db, writes } = fakeDb();

    await expect(submit(db, 2)).resolves.toMatchObject({ verified: false });

    expect(writes.at(-1)).toEqual({ status: "payment_rejected" });
    expect(payment.finalizePaymentSession).toHaveBeenCalledOnce();
  });

  it("does not fail the session when a concurrent submit already moved the booking", async () => {
    verify.mockResolvedValueOnce({ matched: false, transactionRef: null, amount: null, raw: { code: 1012 } });
    const { db } = fakeDb([]);

    await expect(submit(db, 3)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(payment.finalizePaymentSession).not.toHaveBeenCalled();
    expect(payment.updateBookingPaymentStatus).not.toHaveBeenCalled();
  });
});
