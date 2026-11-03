import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  request: vi.fn(async () => ({})),
  cancel: vi.fn(async () => ({ success: true })),
  exportData: vi.fn(async () => ({})),
  checkPassword: vi.fn(async () => undefined),
}));
vi.mock("./d1/hotelClosure", () => ({
  listOwnClosures: vi.fn(async () => []),
  requestHotelClosure: mocks.request,
  cancelHotelClosure: mocks.cancel,
  exportHotelData: mocks.exportData,
}));
vi.mock("./d1/accountDeletion", async importOriginal => ({ ...await importOriginal<object>(), checkAccountPassword: mocks.checkPassword }));

import { appRouter } from "./routers";

const permissions = ["property.close_hotel"] as never[];
function context(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "owner", email: "o@example.test", name: "O", role: "hotel_owner", roles: ["hotel_owner"], memberships: [{ hotelId: "h1", role: "hotel_owner", permissions }], accessToken: "t", appMetadata: {}, userMetadata: {}, ...overrides },
    clientIp: "unknown", db: {}, auth: {}, headers: new Headers(), caller: { userId: "owner" },
  } as never;
}
const input = { hotel_id: "h1", password: "secret" };

beforeEach(() => vi.clearAllMocks());

describe("hotelClosure router", () => {
  it("lets the owner reach each action", async () => {
    const caller = appRouter.createCaller(context());
    await caller.hotelClosure.request(input);
    await caller.hotelClosure.cancel({ hotel_id: "h1" });
    await caller.hotelClosure.exportData({ hotel_id: "h1" });
    expect(mocks.checkPassword).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.exportData).toHaveBeenCalledOnce();
  });

  it.each([
    ["front desk", { role: "front_desk", roles: ["front_desk"], memberships: [{ hotelId: "h1", role: "front_desk", permissions: [] }] }],
    ["super admin", { role: "super_admin", roles: ["super_admin"], memberships: [] }],
    ["the owner of another hotel", { memberships: [{ hotelId: "h2", role: "hotel_owner", permissions }] }],
  ])("refuses %s before touching anything", async (_name, overrides) => {
    const caller = appRouter.createCaller(context(overrides));
    await expect(caller.hotelClosure.request(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hotelClosure.cancel({ hotel_id: "h1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hotelClosure.exportData({ hotel_id: "h1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.checkPassword).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.exportData).not.toHaveBeenCalled();
  });

  it("stops at a wrong password", async () => {
    mocks.checkPassword.mockRejectedValueOnce(new TRPCError({ code: "BAD_REQUEST", message: "Incorrect password." }));
    await expect(appRouter.createCaller(context()).hotelClosure.request(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("asks for a recent code with 2FA on before a closure or an export", async () => {
    const caller = appRouter.createCaller(context({ twoFactorEnabled: true, session: {} }));
    await expect(caller.hotelClosure.request(input)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.hotelClosure.exportData({ hotel_id: "h1" })).rejects.toBeInstanceOf(TRPCError);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.exportData).not.toHaveBeenCalled();
  });
});
