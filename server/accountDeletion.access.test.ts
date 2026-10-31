import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  getAccountDeletionBlockers: vi.fn(),
  checkAccountPassword: vi.fn(),
  deleteOwnAccount: vi.fn(),
  logSupportProcedure: vi.fn(),
}));

vi.mock("./d1/accountDeletion", async importOriginal => ({
  ...await importOriginal<typeof import("./d1/accountDeletion")>(),
  getAccountDeletionBlockers: mocks.getAccountDeletionBlockers,
  checkAccountPassword: mocks.checkAccountPassword,
  deleteOwnAccount: mocks.deleteOwnAccount,
}));
vi.mock("./d1/supportAccess", async importOriginal => ({
  ...await importOriginal<typeof import("./d1/supportAccess")>(),
  logSupportProcedure: mocks.logSupportProcedure,
}));

import { authRouter } from "./routers/authRouter";

const NOW = Date.now();
const input = { password: "correct horse", confirmEmail: "Me@Example.test" };
const person = (extra: Record<string, unknown> = {}) => ({
  id: "me", email: "me@example.test", roles: [], accessToken: "plain-token", twoFactorEnabled: false, session: { id: "s1" }, ...extra,
});
const callerFor = (user: unknown, extra: Record<string, unknown> = {}) => authRouter.createCaller({
  user, clientIp: "1.1.1.1", db: {}, auth: {}, headers: new Headers(), caller: { userId: "me", access: "authenticated" }, ...extra,
} as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccountDeletionBlockers.mockResolvedValue({ ownedHotels: [], lastPlatformAdmin: false });
  mocks.checkAccountPassword.mockResolvedValue(undefined);
  mocks.deleteOwnAccount.mockResolvedValue({ success: true });
});

describe("auth.deleteAccount", () => {
  it("needs a signed-in user", async () => {
    await expect(callerFor(null).deleteAccount(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFor(null).accountDeletionStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("deletes after the password check, ignoring case in the email", async () => {
    await expect(callerFor(person()).deleteAccount(input)).resolves.toEqual({ success: true });
    expect(mocks.checkAccountPassword).toHaveBeenCalledWith(expect.objectContaining({ userId: "me", password: input.password }));
    expect(mocks.checkAccountPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteOwnAccount.mock.invocationCallOrder[0]!);
  });

  it("only ever targets the session's own user, whatever the request adds", async () => {
    await callerFor(person()).deleteAccount({ ...input, userId: "victim" } as never);
    expect(mocks.deleteOwnAccount).toHaveBeenCalledWith({}, { userId: "me", access: "authenticated" });
  });

  it("refuses an email that is not this account's", async () => {
    await expect(callerFor(person()).deleteAccount({ ...input, confirmEmail: "other@example.test" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.checkAccountPassword).not.toHaveBeenCalled();
  });

  it("does not delete on a wrong password", async () => {
    mocks.checkAccountPassword.mockRejectedValue(new TRPCError({ code: "BAD_REQUEST", message: "Incorrect password." }));
    await expect(callerFor(person()).deleteAccount(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("with 2FA on, refuses without a recent step-up and does not test the password", async () => {
    await expect(callerFor(person({ twoFactorEnabled: true })).deleteAccount(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.checkAccountPassword).not.toHaveBeenCalled();
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("with 2FA on, refuses a step-up past its window", async () => {
    const session = { id: "s1", twoFactorVerifiedAt: new Date(NOW - 11 * 60_000) };
    await expect(callerFor(person({ twoFactorEnabled: true, session })).deleteAccount(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("with 2FA on, proceeds after a recent step-up", async () => {
    const session = { id: "s1", twoFactorVerifiedAt: new Date(NOW - 60_000) };
    await expect(callerFor(person({ twoFactorEnabled: true, session })).deleteAccount(input)).resolves.toEqual({ success: true });
  });

  it("refuses a hotel owner before testing the password", async () => {
    mocks.getAccountDeletionBlockers.mockResolvedValue({ ownedHotels: [{ id: "h1", name: "Hotel" }], lastPlatformAdmin: false });
    await expect(callerFor(person()).deleteAccount(input)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("Transfer") });
    expect(mocks.checkAccountPassword).not.toHaveBeenCalled();
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("refuses the last platform admin", async () => {
    mocks.getAccountDeletionBlockers.mockResolvedValue({ ownedHotels: [], lastPlatformAdmin: true });
    await expect(callerFor(person()).deleteAccount(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("asks for a new sign-in when the session lacks server auth", async () => {
    await expect(callerFor(person(), { auth: undefined }).deleteAccount(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("never leaks the password into an error", async () => {
    mocks.deleteOwnAccount.mockRejectedValue(new Error("boom"));
    const error = await callerFor(person()).deleteAccount(input).catch(caught => caught as Error);
    expect(String((error as Error).message)).not.toContain(input.password);
  });

  it("gives the support audit no hotel id to log, so the password cannot reach it", async () => {
    await callerFor(person({ roles: ["support"] })).deleteAccount(input);
    const [, , path, rawInput] = mocks.logSupportProcedure.mock.calls[0]!;
    expect(path).toBe("deleteAccount");
    expect(rawInput).not.toHaveProperty("hotelId");
    expect(rawInput).not.toHaveProperty("hotel_id");
  });
});

describe("auth.accountDeletionStatus", () => {
  it("reports the caller's own blockers", async () => {
    mocks.getAccountDeletionBlockers.mockResolvedValue({ ownedHotels: [{ id: "h1", name: "Hotel" }], lastPlatformAdmin: false });
    await expect(callerFor(person()).accountDeletionStatus()).resolves.toEqual({ ownedHotels: [{ id: "h1", name: "Hotel" }], lastPlatformAdmin: false });
    expect(mocks.getAccountDeletionBlockers).toHaveBeenCalledWith({}, { userId: "me", access: "authenticated" });
  });
});
