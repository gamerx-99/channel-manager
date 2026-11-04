import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({
  getPlatformBillingSummary: vi.fn(), listPlatformCrm: vi.fn(), updatePlatformHotelProvince: vi.fn(),
  setPlatformHotelPlan: vi.fn(), listPlatformCoupons: vi.fn(), createPlatformCoupon: vi.fn(), deactivatePlatformCoupon: vi.fn(),
}));
vi.mock("./d1/supportAccess", () => ({ logSupportProcedure: vi.fn() }));
vi.mock("./db/scope", async importOriginal => ({ ...await importOriginal<typeof import("./db/scope")>(),
  getPlatformBillingSummary: mocks.getPlatformBillingSummary, listPlatformCrm: mocks.listPlatformCrm,
  updatePlatformHotelProvince: mocks.updatePlatformHotelProvince, setPlatformHotelPlan: mocks.setPlatformHotelPlan,
  listPlatformCoupons: mocks.listPlatformCoupons, createPlatformCoupon: mocks.createPlatformCoupon,
  deactivatePlatformCoupon: mocks.deactivatePlatformCoupon,
}));
const { accessRouter } = await import("./routers/accessRouter");

function caller(role: "super_admin" | "hotel_owner" | "admin" | "support") {
  return accessRouter.createCaller({ clientIp: "test", db: {} as any,
    caller: { userId: "actor", roles: [role], access: "authenticated" } as any,
    user: { id: "actor", role, roles: [role], memberships: [{ hotelId: "h1", role, permissions: resolveMembershipPermissions(role) }],
      email: "actor@example.test", name: "Actor", accessToken: "test", appMetadata: {}, userMetadata: {} },
  });
}

beforeEach(() => { vi.clearAllMocks(); mocks.getPlatformBillingSummary.mockResolvedValue({ hotelCount: 0 }); mocks.listPlatformCrm.mockResolvedValue([]); mocks.listPlatformCoupons.mockResolvedValue([]); mocks.setPlatformHotelPlan.mockResolvedValue({ paidUntil: new Date(0) }); mocks.createPlatformCoupon.mockResolvedValue({ id: "c1" }); });

describe("platform billing procedure boundaries", () => {
  it("billingSummary (revenue) requires platform.manage_billing", async () => {
    await expect(caller("super_admin").billingSummary()).resolves.toEqual({ hotelCount: 0 });
    for (const role of ["hotel_owner", "admin", "support"] as const) {
      await expect(caller(role).billingSummary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.getPlatformBillingSummary).toHaveBeenCalledOnce();
  });
  it.each(["billingCrm", "updateHotelProvince", "setHotelPlan", "coupons", "createCoupon", "deactivateCoupon"] as const)("%s requires platform.manage_billing", async procedure => {
    const admin = caller("super_admin");
    if (procedure === "billingCrm") await expect(admin.billingCrm()).resolves.toEqual([]);
    if (procedure === "updateHotelProvince") await expect(admin.updateHotelProvince({ hotelId: "h1", province: "Mae Hong Son" })).resolves.toEqual({ ok: true });
    if (procedure === "setHotelPlan") await expect(admin.setHotelPlan({ hotelId: "h1", action: "end", reason: "test" })).resolves.toEqual({ paidUntil: expect.any(Date) });
    if (procedure === "coupons") await expect(admin.coupons()).resolves.toEqual([]);
    if (procedure === "createCoupon") await expect(admin.createCoupon({ code: "TEST", percentOff: 50, discountMonths: 1, maxRedemptions: null, expiresAt: null, note: null })).resolves.toEqual({ id: "c1" });
    if (procedure === "deactivateCoupon") await expect(admin.deactivateCoupon({ id: "c1" })).resolves.toEqual({ ok: true });
    const owner = caller("hotel_owner");
    if (procedure === "billingCrm") await expect(owner.billingCrm()).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (procedure === "updateHotelProvince") await expect(owner.updateHotelProvince({ hotelId: "h1", province: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (procedure === "setHotelPlan") await expect(owner.setHotelPlan({ hotelId: "h1", action: "end", reason: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (procedure === "coupons") await expect(owner.coupons()).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (procedure === "createCoupon") await expect(owner.createCoupon({ code: "TEST", percentOff: 50, discountMonths: 1, maxRedemptions: null, expiresAt: null, note: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (procedure === "deactivateCoupon") await expect(owner.deactivateCoupon({ id: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
