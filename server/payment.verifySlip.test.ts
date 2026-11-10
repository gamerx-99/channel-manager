import { beforeEach, describe, expect, it, vi } from "vitest";

const payment = vi.hoisted(() => ({
  getHotelPaymentConfig: vi.fn(),
  getSlipOkCredentialsForVerification: vi.fn(),
  getLatestPaymentSession: vi.fn(),
  createPaymentSession: vi.fn(),
  updateBookingPaymentStatus: vi.fn(),
  updatePaymentSessionStatus: vi.fn(),
  finalizePaymentSession: vi.fn(),
  confirmManualFullPayment: vi.fn(),
  savePaymentSessionSlip: vi.fn(),
}));
const booking = vi.hoisted(() => ({ expireBookingIfPast: vi.fn(), logBookingStatusChange: vi.fn(), claimBookingNights: vi.fn() }));
const verify = vi.hoisted(() => vi.fn());
const decrypt = vi.hoisted(() => vi.fn());

vi.mock("./d1/payment", () => payment);
vi.mock("./d1/booking", () => booking);
vi.mock("./slipokCrypto", () => ({ decryptSlipOkKey: decrypt }));
vi.mock("./slipVerification", async importOriginal => ({ ...(await importOriginal<typeof import("./slipVerification")>()), verifySlipWithSlipOk: verify }));

import { TRPCError } from "@trpc/server";
import { SlipOkError } from "./slipVerification";
import { paymentRouter } from "./routers/paymentRouter";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const HOLD_EXPIRES = new Date("2099-01-01T00:00:00.000Z");

function fakeDb(rejectedRows: unknown[] = [{ id: BOOKING }], published = true, status = "pending_payment", claimRows: unknown[] = [{ id: BOOKING }], paymentStatus = "pending") {
  const writes: Array<Record<string, unknown>> = [];
  const selectChain: any = { from: () => selectChain, innerJoin: () => selectChain, where: () => selectChain, limit: async () => [{ id: BOOKING, hotelId: HOTEL, publicEnabled: published, status, paymentStatus, expiresAt: HOLD_EXPIRES, createdAt: new Date() }] };
  const db = {
    select: () => selectChain,
    $client: { prepare: () => ({ bind: () => ({}) }), batch: vi.fn(async () => []) },
    update: () => ({
      set(values: Record<string, unknown>) {
        writes.push(values);
        // rejectedRows answers only the rejection write; other guarded writes succeed.
        const rows = values.status === "payment_rejected" ? rejectedRows : values.status === "pending_verification" ? claimRows : [{ id: BOOKING }];
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => rows }) };
      },
    }),
  };
  return { db, writes };
}

const submit = (db: unknown, index: number, candidateEnabled = true) => paymentRouter
  .createCaller({ db, media: { put: vi.fn(async () => ({})), delete: vi.fn(async () => {}) }, clientIp: `verify-slip-${index}`, user: null, billingEnv: candidateEnabled ? { BILLING_CANDIDATE_ENABLED: "true" } : undefined } as never)
  .verifySlip({ booking_id: BOOKING, session_id: SESSION, slip_data: "c2xpcA==" });

beforeEach(() => {
  vi.clearAllMocks();
  payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", qr_reference: "ref", expires_at: "2099-01-01T00:00:00.000Z" });
  payment.getHotelPaymentConfig.mockResolvedValue({ promptpay_id: "0812345678", payment_timeout_minutes: 15 });
  payment.finalizePaymentSession.mockResolvedValue({ duplicateRef: false });
  payment.confirmManualFullPayment.mockResolvedValue(true);
  payment.savePaymentSessionSlip.mockResolvedValue(undefined);
  booking.expireBookingIfPast.mockResolvedValue({ status: "pending_payment" });
  booking.claimBookingNights.mockResolvedValue(true);
  payment.getSlipOkCredentialsForVerification.mockResolvedValue({ slipok_key_enc: "encrypted", slipok_branch_id: "hotel-branch" });
  decrypt.mockResolvedValue("hotel-key");
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

  it("uses baseline SlipOK confirmation writes when the candidate is off", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "BANK-REF", amount: 120, raw: { matched: true } });
    const { db, writes } = fakeDb();

    await expect(submit(db, 99, false)).resolves.toMatchObject({ verified: true });

    expect(payment.finalizePaymentSession).toHaveBeenCalledWith(expect.anything(), expect.anything(), HOTEL, SESSION, expect.objectContaining({ status: "paid", verifiedTransactionRef: "BANK-REF" }));
    expect(payment.confirmManualFullPayment).not.toHaveBeenCalled();
    expect(writes).toContainEqual({ status: "confirmed", expiresAt: null });
    expect(payment.updateBookingPaymentStatus).toHaveBeenCalledWith(expect.anything(), expect.anything(), HOTEL, BOOKING, "verified");
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

  it("verifies with the hotel's own SlipOK key", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-1", amount: 120, raw: {} });
    const { db } = fakeDb();

    await expect(submit(db, 5)).resolves.toMatchObject({ verified: true });

    expect(verify).toHaveBeenCalledWith({ apiKey: "hotel-key", branchId: "hotel-branch" }, expect.objectContaining({ expectedAmount: 120 }));
    expect(payment.confirmManualFullPayment).toHaveBeenCalledWith(db, expect.objectContaining({ amountSatang: 12000, transactionReference: "TX-1", reason: "slipok_auto_verified" }));
  });

  it("sends the slip to manual review when the hotel has no SlipOK key", async () => {
    payment.getSlipOkCredentialsForVerification.mockResolvedValueOnce(null);
    const { db, writes } = fakeDb();

    await expect(submit(db, 6)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(verify).not.toHaveBeenCalled();
    expect(writes.at(-1)).toMatchObject({ status: "pending_verification" });
    expect(loggedReasons()).toContain("slipok_not_configured_manual_review_required");
    expect(payment.savePaymentSessionSlip).toHaveBeenCalledWith(expect.anything(), expect.anything(), HOTEL, SESSION, `payment-slips/${HOTEL}/${SESSION}`);
  });

  it("sends the slip to manual review when SlipOK refuses the hotel key", async () => {
    verify.mockRejectedValueOnce(new SlipOkError("bad key", "INVALID_KEY"));
    const { db } = fakeDb();

    await expect(submit(db, 9)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(loggedReasons()).toContain("slipok_key_rejected_manual_review_required");
  });

  it("sends the slip to manual review when the stored key cannot be decrypted", async () => {
    decrypt.mockRejectedValueOnce(new Error("SLIPOK_ENCRYPTION_KEY must be set"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();

    await expect(submit(db, 16)).resolves.toMatchObject({ pendingManualReview: true });
    expect(verify).not.toHaveBeenCalled();
  });

  it("hands the booking to staff when the hotel credentials cannot be read after the claim", async () => {
    payment.getSlipOkCredentialsForVerification.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN", message: "Hotel access denied." }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();

    await expect(submit(db, 17)).resolves.toMatchObject({ pendingManualReview: true });
    expect(loggedReasons()).toContain("verification_error_manual_review_required");
  });

  it("keeps the booking for staff when the slip reference was already used", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-USED", amount: 120, raw: {} });
    payment.confirmManualFullPayment.mockRejectedValueOnce(new TRPCError({ code: "CONFLICT", message: "duplicate transaction reference" }));
    const { db, writes } = fakeDb();

    await expect(submit(db, 10)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(writes.some(write => write.status === "confirmed")).toBe(false);
    expect(loggedReasons()).not.toContain("duplicate_slip_ref");
  });

  it("refuses a second concurrent submit instead of reprocessing the booking", async () => {
    const { db, writes } = fakeDb(undefined, true, "pending_payment", []);

    await expect(submit(db, 11)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(verify).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });

  it("rechecks the room before confirming a booking that was payment_rejected", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-4", amount: 120, raw: {} });
    const { db } = fakeDb(undefined, true, "payment_rejected");

    await expect(submit(db, 12)).resolves.toMatchObject({ verified: true });

    expect(booking.claimBookingNights).toHaveBeenCalledWith(db, expect.anything(), HOTEL, BOOKING);
    expect(payment.confirmManualFullPayment).toHaveBeenCalledOnce();
  });

  it("sends a payment_rejected booking to manual review when its room is taken", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-5", amount: 120, raw: {} });
    booking.claimBookingNights.mockResolvedValueOnce(false);
    const { db, writes } = fakeDb(undefined, true, "payment_rejected");

    await expect(submit(db, 13)).resolves.toMatchObject({ verified: false, pendingManualReview: true });

    expect(writes.some(write => write.status === "confirmed")).toBe(false);
    expect(loggedReasons()).toContain("room_unavailable_manual_review_required");
  });

  it("does not recheck the room for a booking that kept its hold", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-6", amount: 120, raw: {} });
    const { db } = fakeDb();

    await expect(submit(db, 14)).resolves.toMatchObject({ verified: true });

    expect(booking.claimBookingNights).not.toHaveBeenCalled();
  });

  it("hands the booking to staff when an unexpected error follows the claim", async () => {
    verify.mockResolvedValueOnce({ matched: true, transactionRef: "TX-7", amount: 120, raw: {} });
    payment.confirmManualFullPayment.mockRejectedValueOnce(new Error("D1 down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();

    await expect(submit(db, 15)).resolves.toMatchObject({ pendingManualReview: true });
    expect(loggedReasons()).toContain("verification_error_manual_review_required");
  });
});

describe("checkStatus while a slip waits for staff", () => {
  const check = (db: unknown, index: number) => paymentRouter
    .createCaller({ db, clientIp: `check-status-${index}`, user: null } as never)
    .checkStatus({ booking_id: BOOKING, session_id: SESSION });

  it("does not expire the session or fail the payment after the QR time runs out", async () => {
    payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", status: "pending", expires_at: "2000-01-01T00:00:00.000Z" });
    await expect(check(fakeDb(undefined, true, "pending_verification").db, 1)).resolves.toEqual({ status: "under_review", verifiedAt: null });
    expect(payment.updatePaymentSessionStatus).not.toHaveBeenCalled();
    expect(payment.updateBookingPaymentStatus).not.toHaveBeenCalled();
  });

  it("still expires an unpaid session", async () => {
    payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", status: "pending", expires_at: "2000-01-01T00:00:00.000Z" });
    await expect(check(fakeDb(undefined, true, "pending_payment").db, 2)).resolves.toEqual({ status: "expired", verifiedAt: null });
    expect(payment.updatePaymentSessionStatus).toHaveBeenCalledWith(expect.anything(), expect.anything(), HOTEL, SESSION, "expired");
  });

  it("reports staff approval as paid even if the session had not been finalized", async () => {
    payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", status: "pending", expires_at: "2099-01-01T00:00:00.000Z", verified_at: "2026-11-09T00:00:00.000Z" });
    await expect(check(fakeDb(undefined, true, "confirmed", [], "verified").db, 3)).resolves.toEqual({ status: "paid", verifiedAt: "2026-11-09T00:00:00.000Z" });
  });

  it("reports staff rejection as failed", async () => {
    payment.getLatestPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING, hotel_id: HOTEL, amount: "120.00", status: "pending", expires_at: "2099-01-01T00:00:00.000Z" });
    await expect(check(fakeDb(undefined, true, "payment_rejected", [], "failed").db, 4)).resolves.toEqual({ status: "failed", verifiedAt: null });
  });
});
