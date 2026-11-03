import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({
  listPlatformUsers: vi.fn(),
  listPlatformHotelDirectory: vi.fn(),
}));

vi.mock("./d1/staff", () => ({ listPlatformUsers: mocks.listPlatformUsers }));
vi.mock("./d1/hotel", () => ({ listPlatformHotelDirectory: mocks.listPlatformHotelDirectory }));

const { staffRouter } = await import("./routers/staffRouter");
const { hotelRouter } = await import("./routers/hotelRouter");

function caller(role: "super_admin" | "admin" | "hotel_owner", hasDb = true) {
  const permissions = resolveMembershipPermissions(role);
  return {
    staff: staffRouter.createCaller({
      clientIp: "test", db: hasDb ? {} as any : undefined,
      caller: { userId: "actor", roles: [role], access: "authenticated" } as any,
      user: { id: "actor", role, roles: [role], memberships: [{ hotelId: "hotel-1", role, permissions }], email: "admin@example.test", name: "Admin", accessToken: "test", appMetadata: {}, userMetadata: {} },
    }),
    hotels: hotelRouter.createCaller({
      clientIp: "test", db: hasDb ? {} as any : undefined,
      caller: { userId: "actor", roles: [role], access: "authenticated" } as any,
      user: { id: "actor", role, roles: [role], memberships: [{ hotelId: "hotel-1", role, permissions }], email: "admin@example.test", name: "Admin", accessToken: "test", appMetadata: {}, userMetadata: {} },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPlatformUsers.mockResolvedValue([{ id: "u1", email: "owner@example.test", name: "Owner", created_at: new Date(0), roles: [{ role: "hotel_owner", hotel_id: "h1" }] }]);
  mocks.listPlatformHotelDirectory.mockResolvedValue([{ id: "h1", name: "Hotel", slug: "hotel", public_enabled: true, created_at: new Date(0) }]);
});

describe("platform directory router boundaries", () => {
  it("adminUsers requires platform.manage_users and returns only its allowlisted account shape", async () => {
    const allowed = caller("super_admin");
    const result = await allowed.staff.adminUsers();
    expect(mocks.listPlatformUsers).toHaveBeenCalledOnce();
    expect(result).toEqual({ users: [{ id: "u1", email: "owner@example.test", name: "Owner", created_at: new Date(0), roles: [{ role: "hotel_owner", hotel_id: "h1" }] }] });
    expect(JSON.stringify(result.users)).not.toMatch(/password|token|session|guest|secret/i);

    await expect(caller("admin").staff.adminUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listPlatformUsers).toHaveBeenCalledOnce();
  });

  it("adminHotels requires platform.manage_hotels and returns summary rows only", async () => {
    const result = await caller("super_admin").hotels.adminHotels();
    expect(mocks.listPlatformHotelDirectory).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: "h1", name: "Hotel", slug: "hotel", public_enabled: true, created_at: new Date(0) }]);
    expect(JSON.stringify(result)).not.toMatch(/booking|guest|price|payment/i);

    await expect(caller("admin").hotels.adminHotels()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listPlatformHotelDirectory).toHaveBeenCalledOnce();
  });
});
