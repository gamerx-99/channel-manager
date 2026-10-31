import { beforeEach, describe, expect, it, vi } from "vitest";

const stepUp = vi.hoisted(() => ({ verifyMfaStepUp: vi.fn() }));
const payment = vi.hoisted(() => ({ savePromptPaySettings: vi.fn() }));
vi.mock("./mfaStepUp", () => stepUp);
vi.mock("./d1/payment", () => payment);

import { appRouter } from "./routers";

const HOTEL = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
const USER = "d93900a0-e7fe-45d6-9364-80ea8a035322";

function caller(options: { twoFactorEnabled?: boolean; verifiedAt?: Date | null } = {}) {
  const session = { id: "sess-1", token: "plain-token", createdAt: new Date(), twoFactorVerifiedAt: options.verifiedAt ?? null };
  return appRouter.createCaller({
    clientIp: `mfa-${Math.random()}`,
    db: {} as never,
    auth: {} as never,
    headers: new Headers(),
    caller: { userId: USER, roles: ["hotel_owner"], access: "authenticated" },
    user: {
      id: USER, email: "owner@example.test", name: "Owner", accessToken: "plain-token", appMetadata: {}, userMetadata: {},
      role: "hotel_owner", roles: ["hotel_owner"], memberships: [{ hotelId: HOTEL, role: "hotel_owner", permissions: ["property.manage_profile"] }],
      twoFactorEnabled: options.twoFactorEnabled ?? true, session,
    },
  } as never);
}

const savePromptPay = (app: ReturnType<typeof caller>) => app.slipok.savePromptPayId({ hotel_id: HOTEL, promptpay_id: "0812345678", payment_timeout_minutes: 15 });

beforeEach(() => vi.clearAllMocks());

describe("MFA step-up procedures", () => {
  it("verifies the code for the current session", async () => {
    stepUp.verifyMfaStepUp.mockResolvedValueOnce(undefined);
    await expect(caller().auth.verifyMfaStepUp({ code: "123456" })).resolves.toEqual({ verified: true });
    expect(stepUp.verifyMfaStepUp).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-1", userId: USER, code: "123456" }));
  });

  it("asks an owner without an authenticator to set one up", async () => {
    await expect(caller({ twoFactorEnabled: false }).auth.verifyMfaStepUp({ code: "123456" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(stepUp.verifyMfaStepUp).not.toHaveBeenCalled();
  });

  it("refuses a malformed code before calling Better Auth", async () => {
    await expect(caller().auth.verifyMfaStepUp({ code: "12345" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(stepUp.verifyMfaStepUp).not.toHaveBeenCalled();
  });

  it("reports the step-up status of the session", async () => {
    await expect(caller({ twoFactorEnabled: false }).auth.mfaStepUpStatus()).resolves.toMatchObject({ status: "needs_enroll" });
    await expect(caller().auth.mfaStepUpStatus()).resolves.toMatchObject({ status: "needs_challenge" });
    await expect(caller({ verifiedAt: new Date() }).auth.mfaStepUpStatus()).resolves.toMatchObject({ status: "verified" });
  });
});

describe("slipok.savePromptPayId with the real MFA check", () => {
  it("saves after a recent step-up", async () => {
    payment.savePromptPaySettings.mockResolvedValueOnce(undefined);
    await expect(savePromptPay(caller({ verifiedAt: new Date() }))).resolves.toEqual({ success: true });
  });

  it("refuses without a step-up", async () => {
    await expect(savePromptPay(caller())).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(payment.savePromptPaySettings).not.toHaveBeenCalled();
  });

  it("refuses when the step-up window has passed", async () => {
    await expect(savePromptPay(caller({ verifiedAt: new Date(Date.now() - 11 * 60_000) }))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
