import { beforeEach, describe, expect, it, vi } from "vitest";

const secretValues = ["SENTINEL_ENC_KEY", "SENTINEL_HASH", "SENTINEL_BRANCH", "SENTINEL_DECRYPTED_KEY", "SENTINEL_API_KEY"];
const database = vi.hoisted(() => ({
  getHotelPaymentConfig: vi.fn(),
  getSlipOkCredentialsForVerification: vi.fn(),
  getSlipOkSettings: vi.fn(),
  saveSlipOkSettings: vi.fn(),
  removeSlipOkKey: vi.fn(),
  savePromptPaySettings: vi.fn(),
  getLatestPaymentSession: vi.fn(),
  createPaymentSession: vi.fn(),
  updateBookingPaymentStatus: vi.fn(),
  updatePaymentSessionStatus: vi.fn(),
  finalizePaymentSession: vi.fn(),
  logBookingStatusChange: vi.fn(),
  expireBookingIfPast: vi.fn(),
  claimBookingNights: vi.fn(),
}));
const crypto = vi.hoisted(() => ({ encryptSlipOkKey: vi.fn(), hashSlipOkKey: vi.fn(), decryptSlipOkKey: vi.fn() }));
const slip = vi.hoisted(() => {
  class SlipOkError extends Error { constructor(message: string, public code: "INVALID_KEY" | "API_ERROR" | "UNREADABLE_SLIP") { super(message); } }
  return { verifySlipWithSlipOk: vi.fn(), SlipOkError };
});

vi.mock("./d1/payment", () => database);
vi.mock("./d1/booking", () => database);
vi.mock("./routerUtils", () => ({
  requireHotelPermission: vi.fn(),
  rethrowDomainError: (error: unknown) => { throw error; },
}));
vi.mock("./mfa", () => ({ requireRecentMfaVerification: vi.fn() }));
vi.mock("./slipokCrypto", () => crypto);
vi.mock("./slipVerification", () => ({
  verifySlipWithSlipOk: slip.verifySlipWithSlipOk,
  SlipOkError: slip.SlipOkError,
}));

const HOTEL = "11111111-1111-4111-8111-111111111111";
const BOOKING_CREATE = "22222222-2222-4222-8222-222222222222";
const BOOKING_STATUS = "33333333-3333-4333-8333-333333333333";
const BOOKING_VERIFY = "44444444-4444-4444-8444-444444444444";
const BOOKING_MANUAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";

function fakeDb() {
  const row = { id: BOOKING_VERIFY, hotelId: HOTEL, publicEnabled: true, status: "pending_payment", expiresAt: null, price: "120.00" };
  const selectChain: any = { from: () => selectChain, innerJoin: () => selectChain, where: () => selectChain, limit: async () => [row] };
  return {
    select: () => selectChain,
    update: () => ({ set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: BOOKING_VERIFY }] }) }) }),
  };
}

const context = (index: number) => ({
  db: fakeDb(),
  req: {} as Request,
  res: {} as Response,
  clientIp: `secret-leak-test-${index}`,
  user: {
    id: "user-a", email: "owner@example.test", name: "Owner",
    appMetadata: {}, userMetadata: {}, role: "hotel_owner", roles: ["hotel_owner"], memberships: [{ hotelId: HOTEL, role: "hotel_owner" }],
  },
});

async function capture(operation: () => Promise<unknown>) {
  try { return { result: await operation() }; }
  catch (error) { return { error }; }
}

function serialized(outcome: Awaited<ReturnType<typeof capture>>) {
  return JSON.stringify("result" in outcome ? outcome.result : {
    json: outcome.error,
    name: outcome.error instanceof Error ? outcome.error.name : undefined,
    message: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    code: (outcome.error as { code?: string } | null)?.code,
  });
}

function assertNoSecrets(outcome: Awaited<ReturnType<typeof capture>>) {
  const output = serialized(outcome);
  for (const value of secretValues) expect(output).not.toContain(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.getHotelPaymentConfig.mockResolvedValue({ promptpay_id: "0812345678", payment_timeout_minutes: 15 });
  database.getSlipOkCredentialsForVerification.mockResolvedValue({ slipok_key_enc: "SENTINEL_ENC_KEY", slipok_branch_id: "SENTINEL_BRANCH" });
  database.getSlipOkSettings.mockResolvedValue({ configured: true, enabled: true, branchId: "visible-branch-id" });
  database.getLatestPaymentSession.mockImplementation(async (_client: unknown, _caller: unknown, bookingId: string) => {
    if (bookingId === BOOKING_CREATE) return null;
    return { id: SESSION, booking_id: bookingId, hotel_id: HOTEL, status: "pending", amount: "120.00", qr_string: "promptpay", qr_reference: "ref", expires_at: "2099-01-01T00:00:00.000Z", verified_at: null };
  });
  database.createPaymentSession.mockResolvedValue({ id: SESSION, booking_id: BOOKING_CREATE, hotel_id: HOTEL, status: "pending", amount: "120.00", qr_string: "promptpay", qr_reference: "ref", expires_at: "2099-01-01T00:00:00.000Z" });
  database.expireBookingIfPast.mockResolvedValue({ status: "pending_payment", expires_at: null });
  database.finalizePaymentSession.mockResolvedValue({ duplicateRef: false });
  crypto.encryptSlipOkKey.mockResolvedValue("SENTINEL_ENC_KEY");
  crypto.hashSlipOkKey.mockResolvedValue("SENTINEL_HASH");
  crypto.decryptSlipOkKey.mockResolvedValue("SENTINEL_DECRYPTED_KEY");
  slip.verifySlipWithSlipOk.mockResolvedValue({ matched: true, transactionRef: "txn", amount: 120, raw: { success: true } });
});

describe("payment router secret response boundary", () => {
  it("enumerates and calls every payment and SlipOK procedure, including input errors", async () => {
    const [{ paymentRouter }, { slipokRouter }] = await Promise.all([import("./routers/paymentRouter"), import("./routers/slipokRouter")]);
    const paymentInputs: Record<string, unknown> = {
      createSession: { booking_id: BOOKING_CREATE, hotel_id: HOTEL },
      checkStatus: { booking_id: BOOKING_STATUS, session_id: SESSION },
      verifySlip: { booking_id: BOOKING_VERIFY, hotel_id: HOTEL, session_id: SESSION, slip_data: "c2xpcA==" },
      manualVerify: { booking_id: BOOKING_MANUAL, hotel_id: HOTEL, approved: true, note: "reviewed" },
    };
    const slipokInputs: Record<string, unknown> = {
      getSettings: { hotel_id: HOTEL },
      saveKey: { hotel_id: HOTEL, api_key: "SENTINEL_API_KEY", branch_id: "SENTINEL_BRANCH" },
      removeKey: { hotel_id: HOTEL },
      savePromptPayId: { hotel_id: HOTEL, promptpay_id: "0812345678", payment_timeout_minutes: 15 },
    };
    let callIndex = 0;
    for (const [procedure] of Object.entries(paymentRouter._def.procedures)) {
      const caller = paymentRouter.createCaller(context(callIndex++) as never);
      const output = await capture(() => (caller as any)[procedure](paymentInputs[procedure]));
      assertNoSecrets(output);
      const invalidInput = await capture(() => (caller as any)[procedure](undefined));
      assertNoSecrets(invalidInput);
      if (!(procedure in paymentInputs)) expect(invalidInput).toHaveProperty("error");
    }
    for (const [procedure] of Object.entries(slipokRouter._def.procedures)) {
      const caller = slipokRouter.createCaller(context(callIndex++) as never);
      const output = await capture(() => (caller as any)[procedure](slipokInputs[procedure]));
      assertNoSecrets(output);
      const invalidInput = await capture(() => (caller as any)[procedure](undefined));
      assertNoSecrets(invalidInput);
      if (!(procedure in slipokInputs)) expect(invalidInput).toHaveProperty("error");
    }

    // The calls must reach the code that holds the secrets, or this proves nothing.
    expect(slip.verifySlipWithSlipOk).toHaveBeenCalled();
    expect(database.saveSlipOkSettings).toHaveBeenCalled();
    expect(database.getSlipOkSettings).toHaveBeenCalled();
  });

  it("does not expose decrypted credentials when SlipOK refuses the key", async () => {
    const { paymentRouter } = await import("./routers/paymentRouter");
    slip.verifySlipWithSlipOk.mockRejectedValueOnce(new slip.SlipOkError("SENTINEL_DECRYPTED_KEY rejected", "INVALID_KEY"));
    const caller = paymentRouter.createCaller(context(99) as never);
    const outcome = await capture(() => (caller as any).verifySlip({ booking_id: BOOKING_VERIFY, hotel_id: HOTEL, session_id: SESSION, slip_data: "c2xpcA==" }));
    assertNoSecrets(outcome);
    expect(outcome).toMatchObject({ result: { pendingManualReview: true } });
  });

  it("hides the encryption key error when the key cannot be saved", async () => {
    const { slipokRouter } = await import("./routers/slipokRouter");
    vi.spyOn(console, "error").mockImplementation(() => {});
    crypto.encryptSlipOkKey.mockRejectedValueOnce(new Error("SLIPOK_ENCRYPTION_KEY must be a 64-character hex string"));
    const caller = slipokRouter.createCaller(context(100) as never);
    const outcome = await capture(() => (caller as any).saveKey({ hotel_id: HOTEL, api_key: "SENTINEL_API_KEY", branch_id: "SENTINEL_BRANCH" }));
    expect(serialized(outcome)).not.toContain("SLIPOK_ENCRYPTION_KEY");
    expect(database.saveSlipOkSettings).not.toHaveBeenCalled();
  });
});
