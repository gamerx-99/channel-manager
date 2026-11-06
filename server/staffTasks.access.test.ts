import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Permission } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({ listStaffTasks: vi.fn(), listMyStaffTasks: vi.fn(), createStaffTask: vi.fn(), updateStaffTask: vi.fn(), deleteStaffTask: vi.fn(), setStaffTaskDone: vi.fn() }));
vi.mock("./d1/staffTasks", () => ({ listStaffTasks: mocks.listStaffTasks, listMyStaffTasks: mocks.listMyStaffTasks, createStaffTask: mocks.createStaffTask, updateStaffTask: mocks.updateStaffTask, deleteStaffTask: mocks.deleteStaffTask, setStaffTaskDone: mocks.setStaffTaskDone }));
const HOTEL = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4"; const OTHER = "c96264f0-72e4-4aa4-8b74-a0cf52f25b39"; const ID = "987e87f1-9f1d-4f01-a379-0e318d83c057";
function caller(role: "front_desk" | "revenue_manager", grants: Permission[] = []) { const permissions = resolveMembershipPermissions(role, { grants }); return import("./routers").then(({ appRouter }) => appRouter.createCaller({ req: {} as Request, res: {} as Response, user: { id: ID, email: "staff@example.test", name: "Staff", accessToken: "token", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId: HOTEL, role, permissions }] }, db: {} as any, caller: { userId: ID, roles: [role], access: "authenticated" } as any })); }
beforeEach(() => vi.clearAllMocks());
describe("staff task access", () => {
  it("denies reading and completing another member's task", async () => { mocks.listMyStaffTasks.mockResolvedValueOnce([]); mocks.setStaffTaskDone.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN" })); const app = await caller("front_desk"); await expect(app.staffTasks.myTasks({ hotel_id: HOTEL })).resolves.toEqual([]); await expect(app.staffTasks.setDone({ hotel_id: HOTEL, id: ID, done: true })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.listMyStaffTasks).toHaveBeenCalledTimes(1); expect(mocks.setStaffTaskDone).toHaveBeenCalledTimes(1); });
  it("denies task creation to staff without manager permission", async () => { const app = await caller("front_desk"); await expect(app.staffTasks.create({ hotel_id: HOTEL, assigned_to: ID, task_date: "2026-11-06", title: "Task" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.createStaffTask).not.toHaveBeenCalled(); });
  it("allows staff to see and complete own tasks only through the own-task procedures", async () => { mocks.listMyStaffTasks.mockResolvedValueOnce([]); mocks.setStaffTaskDone.mockResolvedValueOnce({ id: ID }); const app = await caller("front_desk"); await expect(app.staffTasks.myTasks({ hotel_id: HOTEL })).resolves.toEqual([]); await expect(app.staffTasks.setDone({ hotel_id: HOTEL, id: ID, done: true })).resolves.toMatchObject({ id: ID }); });
  it("lets a task manager query a date range", async () => { mocks.listStaffTasks.mockResolvedValueOnce([]); const app = await caller("revenue_manager"); await expect(app.staffTasks.list({ hotel_id: HOTEL, from: "2026-11-06", to: "2026-11-07" })).resolves.toEqual([]); expect(mocks.listStaffTasks).toHaveBeenCalled(); });
});
