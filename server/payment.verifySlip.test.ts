import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const payment = vi.hoisted(() => ({
  getHotelPaymentConfig: vi.fn(),
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
  payment.getHotelPaymentConfig.mockResolvedValue({ promptpay_id: "0812345678", payment_timeout_minutes: 15 });
  payment.finalizePaymentSession.mockResolvedValue({ duplicateRef: false });
  booking.expireBookingIfPast.mockResolvedValue({ status: "pending_payment" });
  process.env.SLIPOK_API_KEY = "central-key";
  process.env.SLIPOK_BRANCH_ID = "central-branch";
});

afterEach(() => {
  delete process.env.SLIPOK_API_KEY;
  delete process.env.SLIPOK_BRANCH_ID;
});

const loggedReasons = () => booking.logBookingStatusChange.mock.calls.map(call => call[2].reason);

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
    verify.mockResolvedValueOnce({ matched: false, needsManualReview: false, receiverCheck: null, transactionRef: null, amount: null, raw: { code: 1014 } });
    const { db, writes } = fakeDb();

    await expect(submit(db, 2)).resolves.toMatchObject({ verified: false });

    expect(writes.at(-1)).toEqual({ status: "payment_rejected" });
    expect(payment.finalizePaymentSession).toHaveBeenCalledOnce();
  });

  it("does not fail the session when a concurrent submit already moved the booking", async () => {
    verify.mockResolvedValueOnce({ matched: false, needsManualReview: false, receiverCheck: null, transactionRef: null, amount: null, raw: { code: 1012 } });
    const { db } = fakeDb([]);

    await expect(submit(db, 3)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(payment.finalizePaymentSession).not.toHaveBeenCalled();
    expect(payment.updateBookingPaymentStatus).not.toHaveBeenCalled();
  });

  it("verifies with the central SlipOK account against the hotel PromptPay ID", async () => {
    verify.mockResolvedValueOnce({ matched: true, needsManualReview: false, receiverCheck: "match", transactionRef: "TX-1", amount: 120, raw: {} });
    const { db, writes } = fakeDb();

    await expect(submit(db, 5)).resolves.toMatchObject({ verified: true });

    expect(verify).toHaveBeenCalledWith({ apiKey: "central-key", branchId: "central-branch" }, expect.objectContaining({ expectedAmount: 120, expectedReceiver: "0812345678" }));
    expect(writes.at(-1)).toEqual({ status: "confirmed" });
  });

  it("sends the slip to manual review when the central secrets are missing", async () => {
    delete process.env.SLIPOK_API_KEY;
    const { db, writes } = fakeDb();

    await expect(submit(db, 6)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(verify).not.toHaveBeenCalled();
    expect(writes.at(-1)).toMatchObject({ status: "pending_verification" });
    expect(loggedReasons()).toContain("slipok_not_configured_manual_review_required");
  });

  it("sends the slip to manual review when the receiver cannot be compared", async () => {
    verify.mockResolvedValueOnce({ matched: false, needsManualReview: true, receiverCheck: "unknown", transactionRef: "TX-2", amount: 120, raw: {} });
    const { db, writes } = fakeDb();

    await expect(submit(db, 7)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(writes.at(-1)).toMatchObject({ status: "pending_verification" });
    expect(payment.finalizePaymentSession).not.toHaveBeenCalled();
    expect(loggedReasons()).toContain("slipok_receiver_unverified_manual_review_required");
  });

  it("rejects a slip paid to another receiver", async () => {
    verify.mockResolvedValueOnce({ matched: false, needsManualReview: false, receiverCheck: "mismatch", transactionRef: "TX-3", amount: 120, raw: {} });
    const { db, writes } = fakeDb();

    await expect(submit(db, 8)).resolves.toMatchObject({ verified: false });

    expect(writes.at(-1)).toEqual({ status: "payment_rejected" });
    expect(loggedReasons()).toContain("slipok_receiver_mismatch");
  });

  it("sends the slip to manual review when SlipOK refuses the central key", async () => {
    verify.mockRejectedValueOnce(new SlipOkError("bad key", "INVALID_KEY"));
    const { db } = fakeDb();

    await expect(submit(db, 9)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(loggedReasons()).toContain("slipok_key_rejected_manual_review_required");
  });

  it("keeps the booking for staff when the slip reference was already used", async () => {
    verify.mockResolvedValueOnce({ matched: true, needsManualReview: false, receiverCheck: "match", transactionRef: "TX-USED", amount: 120, raw: {} });
    payment.finalizePaymentSession.mockResolvedValueOnce({ duplicateRef: true });
    const { db, writes } = fakeDb();

    await expect(submit(db, 10)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(writes.some(write => write.status === "confirmed")).toBe(false);
    expect(loggedReasons()).toContain("duplicate_slip_ref");
  });
});
