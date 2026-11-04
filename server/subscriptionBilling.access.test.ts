import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({ getHotelBillingState: vi.fn(), authorizeHotelAction: vi.fn(), verifySlipWithSlipOk: vi.fn() }));
vi.mock("./db/scope", async original => ({ ...await original<typeof import("./db/scope")>(), getHotelBillingState: mocks.getHotelBillingState, authorizeHotelAction: mocks.authorizeHotelAction }));
vi.mock("./slipVerification", () => ({ verifySlipWithSlipOk: mocks.verifySlipWithSlipOk }));
vi.mock("./d1/supportAccess", () => ({ logSupportProcedure: vi.fn() }));
const { subscriptionBillingRouter } = await import("./subscriptionBillingRouter");

const hotelId = "00000000-0000-4000-8000-000000000001";
function caller(role: "hotel_owner" | "super_admin" | "admin" | "support", membershipHotelId = hotelId) {
  const permissions = resolveMembershipPermissions(role);
  return subscriptionBillingRouter.createCaller({ clientIp: "test", db: {} as any, billingEnv: {},
    caller: { userId: "user-1", roles: [role], access: "authenticated" } as any,
    user: { id: "user-1", role, roles: [role], memberships: [{ hotelId: membershipHotelId, role, permissions }], email: "test@example.test", name: "Test", accessToken: "test", appMetadata: {}, userMetadata: {} },
  });
}

beforeEach(() => { vi.clearAllMocks(); mocks.getHotelBillingState.mockResolvedValue({ hotelId, plan: "trial", endsAt: new Date("2026-11-19T00:00:00.000Z"), daysLeft: 10, trialEndsAt: new Date("2026-11-19T00:00:00.000Z") }); });

describe("subscription billing access", () => {
  it("allows an owner with property.manage_billing to read their plan", async () => {
    await expect(caller("hotel_owner").state({ hotelId })).resolves.toMatchObject({ plan: "trial" });
  });
  it("denies another hotel's owner and platform roles", async () => {
    await expect(caller("hotel_owner", "00000000-0000-4000-8000-000000000002").state({ hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getHotelBillingState).not.toHaveBeenCalled();
  });
  it("denies platform roles even though super admin has a blanket permission filter", async () => {
    await expect(caller("super_admin").state({ hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("admin").state({ hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("support").state({ hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getHotelBillingState).not.toHaveBeenCalled();
  });
});
