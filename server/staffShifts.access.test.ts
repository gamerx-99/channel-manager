import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";
const mocks = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), edit: vi.fn(), remove: vi.fn() }));
vi.mock("./d1/staffShifts", () => ({ listStaffShifts: mocks.list, addStaffShift: mocks.add, editStaffShift: mocks.edit, deleteStaffShift: mocks.remove }));
const HOTEL = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
async function app(role: "front_desk" | "hotel_owner" | "revenue_manager", grant = false) {
 const { appRouter } = await import("./routers"); const permissions = resolveMembershipPermissions(role, { grants: grant ? ["staff.manage_shifts"] : [] });
 return appRouter.createCaller({ req: {} as Request, res: {} as Response, user: { id: "10dce714-8338-443a-a705-529ef92bf104", email: "test@example.com", name: "Test", accessToken: "token", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId: HOTEL, role, permissions }] }, db: {} as any, caller: { userId: "10dce714-8338-443a-a705-529ef92bf104", roles: [role], access: "authenticated" } as any });
}
beforeEach(() => vi.clearAllMocks());
describe("staff shift router permissions", () => {
 it("lets staff view shifts", async () => { mocks.list.mockResolvedValue({ members: [], shifts: [] }); await expect((await app("front_desk")).staffShifts.list({ hotel_id: HOTEL, month: "2026-11" })).resolves.toEqual({ members: [], shifts: [] }); });
 it("allows only owners and managers to manage shifts by default", async () => { mocks.add.mockResolvedValue({ id: "ok" }); await expect((await app("hotel_owner")).staffShifts.add({ hotel_id: HOTEL, hotel_user_id: "10dce714-8338-443a-a705-529ef92bf104", date: "2026-11-01", start_time: "08:00", end_time: "17:00", break_minutes: 60 })).resolves.toEqual({ id: "ok" }); await expect((await app("front_desk")).staffShifts.add({ hotel_id: HOTEL, hotel_user_id: "10dce714-8338-443a-a705-529ef92bf104", date: "2026-11-01", start_time: "08:00", end_time: "17:00", break_minutes: 60 })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
});
