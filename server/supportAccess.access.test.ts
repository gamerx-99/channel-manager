import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole, Permission } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({ grantSupportAccess: vi.fn(), revokeSupportAccess: vi.fn(), listSupportAccess: vi.fn(), updateHotelStaffPermissions: vi.fn(), listPlatformHotelSummaries: vi.fn(), findSupportUserIdByEmail: vi.fn(), inviteSupportAccount: vi.fn(), listSupportAccounts: vi.fn(), disableSupportAccount: vi.fn() }));
vi.mock("./d1/supportAccess", () => ({ grantSupportAccess: mocks.grantSupportAccess, revokeSupportAccess: mocks.revokeSupportAccess, listSupportAccess: mocks.listSupportAccess, findSupportUserIdByEmail: mocks.findSupportUserIdByEmail, inviteSupportAccount: mocks.inviteSupportAccount, listSupportAccounts: mocks.listSupportAccounts, disableSupportAccount: mocks.disableSupportAccount, logSupportProcedure: vi.fn() }));
vi.mock("./db/scope", () => ({ updateHotelStaffPermissions: mocks.updateHotelStaffPermissions, listPlatformHotelSummaries: mocks.listPlatformHotelSummaries }));
const { accessRouter } = await import("./routers/accessRouter");
const hotelId = "11111111-1111-4111-8111-111111111111";
const otherHotel = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
function caller(role: AppRole, permissions = resolveMembershipPermissions(role), membershipHotel = hotelId, hasDb = true) {
  return accessRouter.createCaller({ clientIp: "test", db: hasDb ? {} as any : undefined, caller: { userId: "actor", roles: [role] }, user: { id: "actor", role, roles: [role], memberships: [{ hotelId: membershipHotel, role, permissions }], email: null, name: null, accessToken: "test", appMetadata: {}, userMetadata: {} } });
}
beforeEach(() => { Object.values(mocks).forEach(mock => { mock.mockReset(); mock.mockResolvedValue({ ok: true }); }); });

describe("support/permissions router boundaries", () => {
  const ownerCalls = [
    { name: "grant", run: (app: ReturnType<typeof caller>, id = hotelId) => app.grantSupport({ hotelId: id, supportEmail: "support@example.test", mode: "view", durationHours: 1 }), helper: mocks.grantSupportAccess },
    { name: "revoke", run: (app: ReturnType<typeof caller>, id = hotelId) => app.revokeSupport({ hotelId: id, grantId }), helper: mocks.revokeSupportAccess },
    { name: "audit", run: (app: ReturnType<typeof caller>, id = hotelId) => app.supportAccess({ hotelId: id }), helper: mocks.listSupportAccess },
  ];
  for (const test of ownerCalls) {
    it(`${test.name}: checks owner permission before calling the repository`, async () => {
      for (const role of ["front_desk", "revenue_manager", "support", "admin", "super_admin"] as const) await expect(test.run(caller(role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(test.run(caller("front_desk", ["property.view", "property.manage_staff"]))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(test.run(caller("hotel_owner"), otherHotel)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(test.helper).not.toHaveBeenCalled();
      await expect(test.run(caller("hotel_owner"))).resolves.toEqual({ ok: true });
      expect(test.helper).toHaveBeenCalledOnce();
    });
    it(`${test.name}: preserves domain denials and reports unavailable D1`, async () => {
      await expect(test.run(caller("hotel_owner", undefined, hotelId, false))).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      const { TRPCError } = await import("@trpc/server");
      test.helper.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
      await expect(test.run(caller("hotel_owner"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
  it("staff toggles require this hotel's resolved manage_staff permission", async () => {
    const input = { hotelId, targetUserId: "staff", permissions: ["property.view"] as Permission[] };
    for (const role of ["front_desk", "support", "super_admin"] as const) await expect(caller(role).updateStaffPermissions(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("hotel_owner").updateStaffPermissions({ ...input, hotelId: otherHotel })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updateHotelStaffPermissions).not.toHaveBeenCalled();
    await caller("front_desk", ["property.view", "property.manage_staff"]).updateStaffPermissions(input);
    expect(mocks.updateHotelStaffPermissions).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "actor" }), hotelId, "staff", ["property.view"]);
  });
  it("platform summary is exclusive to the platform system-logs permission", async () => {
    for (const role of ["hotel_owner", "support", "admin"] as const) await expect(caller(role).platformSummary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listPlatformHotelSummaries).not.toHaveBeenCalled();
    await caller("super_admin").platformSummary();
    expect(mocks.listPlatformHotelSummaries).toHaveBeenCalledOnce();
  });
  it("only super admin manages support accounts, and an owner cannot invite one", async () => {
    const id = grantId;
    for (const role of ["hotel_owner", "admin", "support", "front_desk"] as const) {
      await expect(caller(role).inviteSupportAccount({ email: "new@example.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(role).supportAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(role).disableSupportAccount({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.inviteSupportAccount).not.toHaveBeenCalled();
    await caller("super_admin").inviteSupportAccount({ email: "New@Example.test" });
    expect(mocks.inviteSupportAccount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "actor" }), expect.anything(), { email: "new@example.test" });
  });
  it("grants by email, resolving the support account first", async () => {
    mocks.findSupportUserIdByEmail.mockResolvedValue("support-id");
    await caller("hotel_owner").grantSupport({ hotelId, supportEmail: "S@Example.test", mode: "view", durationHours: 1 });
    expect(mocks.findSupportUserIdByEmail).toHaveBeenCalledWith(expect.anything(), "s@example.test");
    expect(mocks.grantSupportAccess).toHaveBeenCalledWith(expect.anything(), expect.anything(), { hotelId, supportUserId: "support-id", mode: "view", durationHours: 1 });
  });
  it("validates exact duration/mode/permissions before mutations", async () => {
    await expect(caller("hotel_owner").grantSupport({ hotelId, supportEmail: "s@example.test", durationHours: 2 as any, mode: "view" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("hotel_owner").grantSupport({ hotelId, supportEmail: "s@example.test", durationHours: 1, mode: "root" as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("hotel_owner").updateStaffPermissions({ hotelId, targetUserId: "s", permissions: ["made-up" as any] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.grantSupportAccess).not.toHaveBeenCalled();
    expect(mocks.updateHotelStaffPermissions).not.toHaveBeenCalled();
  });
  it("all new endpoints reject an unauthenticated caller", async () => {
    const app = accessRouter.createCaller({ user: null, clientIp: "test" });
    await expect(app.platformSummary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.supportAccess({ hotelId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.grantSupport({ hotelId, supportEmail: "s@example.test", durationHours: 1, mode: "view" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.revokeSupport({ hotelId, grantId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.updateStaffPermissions({ hotelId, targetUserId: "s", permissions: [] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});


it("ownership transfer denies delegated manage_staff at the router before any D1 access", async () => {
  const { staffRouter } = await import("./routers/staffRouter");
  const app = staffRouter.createCaller({ clientIp: "test", db: {} as any, user: {
    id: "manager", role: "front_desk", roles: ["front_desk"], memberships: [{ hotelId, role: "front_desk", permissions: ["property.view", "property.manage_staff"] }], email: null, name: null, accessToken: "test", appMetadata: {}, userMetadata: {},
  } });
  await expect(app.transferHotelAdmin({ hotel_id: hotelId, target_membership_id: grantId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
