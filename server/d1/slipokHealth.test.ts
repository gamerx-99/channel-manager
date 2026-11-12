import { describe, expect, it, vi } from "vitest";
import { checkSlipOkQuota, healthFromSlipOkCode, healthFromSlipOkError, recordSlipOkHealth } from "./slipokHealth";
import { SlipOkError } from "../slipVerification";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("SlipOK account health", () => {
  it("reads the hotel's account problem from SlipOK's codes", () => {
    expect(healthFromSlipOkCode(1003)).toBe("package_expired");
    expect(healthFromSlipOkCode(1004)).toBe("quota_exceeded");
    expect(healthFromSlipOkCode(1001)).toBe("credentials_rejected");
    expect(healthFromSlipOkCode(undefined, 401)).toBe("credentials_rejected");
    // Bank outages and delays pass on their own and are not the hotel's to fix.
    expect(healthFromSlipOkCode(1009)).toBeNull();
    expect(healthFromSlipOkCode(1010)).toBeNull();
    expect(healthFromSlipOkError(new SlipOkError("x", "API_ERROR", 1003))).toBe("package_expired");
    expect(healthFromSlipOkError(new SlipOkError("x", "INVALID_KEY"))).toBe("credentials_rejected");
    expect(healthFromSlipOkError(new SlipOkError("x", "UNREADABLE_SLIP", 1006))).toBeNull();
  });

  it("checks the quota endpoint with the branch from a whole API URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { quota: 87, overQuota: 0 } }));
    await expect(checkSlipOkQuota({ apiKey: "k", branchId: "https://api.slipok.com/api/line/apikey/78809" }, fetchImpl)).resolves.toEqual({ health: "ok", quota: 87 });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.slipok.com/api/line/apikey/78809/quota", { headers: { "x-authorization": "k" } });
  });

  it("reports an expired package from the quota endpoint and ignores outages", async () => {
    await expect(checkSlipOkQuota({ apiKey: "k", branchId: "78809" }, vi.fn().mockResolvedValue(jsonResponse(400, { code: 1003 }))))
      .resolves.toEqual({ health: "package_expired", quota: null });
    await expect(checkSlipOkQuota({ apiKey: "k", branchId: "78809" }, vi.fn().mockResolvedValue(jsonResponse(500, { code: 1009 })))).resolves.toBeNull();
    await expect(checkSlipOkQuota({ apiKey: "k", branchId: "78809" }, vi.fn().mockRejectedValue(new Error("offline")))).resolves.toBeNull();
  });
});

describe("recordSlipOkHealth", () => {
  /** A tiny stand-in for the two Drizzle calls the function makes. */
  function fakeDb(row: { alerted: string | null } | null, hotel = { name: "Little Bro", notificationEmail: "owner@example.com", ownerContact: "" }) {
    const updates: Record<string, unknown>[] = [];
    let selects = 0;
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (selects++ === 0 ? (row ? [row] : []) : [hotel]) }) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: async () => undefined }; } }),
    };
    return { db: db as never, updates };
  }

  it("emails the hotel once about a new problem and remembers it", async () => {
    const { db, updates } = fakeDb({ alerted: null });
    const sendEmail = vi.fn().mockResolvedValue({ id: "1", success: true });
    await recordSlipOkHealth(db, { sendEmail } as never, "hotel-1", "package_expired");
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "owner@example.com" });
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.slipok.com");
    expect(updates.at(-1)).toEqual({ slipokAlertedHealth: "package_expired" });
  });

  it("does not email the same problem twice", async () => {
    const { db } = fakeDb({ alerted: "package_expired" });
    const sendEmail = vi.fn();
    await recordSlipOkHealth(db, { sendEmail } as never, "hotel-1", "package_expired");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("clears the warning when SlipOK works again", async () => {
    const { db, updates } = fakeDb({ alerted: "package_expired" });
    const sendEmail = vi.fn();
    await recordSlipOkHealth(db, { sendEmail } as never, "hotel-1", "ok", { quota: 99 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ slipokHealth: "ok", slipokQuota: 99, slipokAlertedHealth: null });
  });
});
