import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";
import type { Permission } from "@shared/authorization";

const mocks = vi.hoisted(() => ({ saveCalendarRange: vi.fn(), listCalendarForHotel: vi.fn() }));
vi.mock("./d1/availability", () => ({
  saveCalendarRange: mocks.saveCalendarRange,
  listAvailabilityForHotel: vi.fn(),
  listBookingOccupancyForHotel: vi.fn(),
  updateAvailability: vi.fn(),
  updateAvailabilityBatch: vi.fn(),
  createRateOverride: vi.fn(),
  listRateOverrides: vi.fn(),
  deleteRateOverride: vi.fn(),
  listCalendarForHotel: mocks.listCalendarForHotel,
}));

const HOTEL_ID = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
const ROOM_TYPE_ID = "11111111-1111-4111-8111-111111111111";

async function caller(grants: Permission[]) {
  const permissions = resolveMembershipPermissions("front_desk", { grants });
  const { appRouter } = await import("./routers");
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: "d93900a0-e7fe-45d6-9364-80ea8a035322",
      email: "desk@example.com",
      name: "Front desk",
      accessToken: "front-desk-token",
      appMetadata: {},
      userMetadata: {},
      role: "front_desk",
      roles: ["front_desk"],
      memberships: [{ hotelId: HOTEL_ID, role: "front_desk", permissions }],
    },
    db: {} as any,
    caller: { userId: "d93900a0-e7fe-45d6-9364-80ea8a035322", roles: ["front_desk"], access: "authenticated" } as any,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveCalendarRange.mockResolvedValue({ success: true });
  mocks.listCalendarForHotel.mockResolvedValue({ canSeePrice: false, rows: [{ price: null }] });
});

describe("calendar range permission boundary", () => {
  it("allows allotment-only staff to save rooms while omitting an absent minimum stay", async () => {
    const app = await caller(["revenue.manage_allotment"]);
    await expect(app.channelManager.saveCalendarRange({
      hotel_id: HOTEL_ID,
      room_type_ids: [ROOM_TYPE_ID],
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      rooms_available: 1,
    })).resolves.toEqual({ success: true });
    expect(mocks.saveCalendarRange).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ minStayNights: undefined }));
  });

  it("returns null prices to front desk and forbids price edits", async () => {
    const app = await caller(["revenue.manage_allotment"]);
    const calendar = await app.channelManager.listCalendar({ hotel_id: HOTEL_ID, start_date: "2026-12-01", end_date: "2026-12-02" });
    expect(calendar).toMatchObject({ canSeePrice: false, rows: [{ price: null }] });
    await expect(app.channelManager.saveCalendarRange({
      hotel_id: HOTEL_ID,
      room_type_ids: [ROOM_TYPE_ID],
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      price: 1200,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.saveCalendarRange).not.toHaveBeenCalled();
  });
});
