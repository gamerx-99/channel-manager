import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMembershipPermissions } from "@shared/permissions";

const mocks = vi.hoisted(() => ({ save: vi.fn(), publish: vi.fn(), getHotel: vi.fn() }));
vi.mock("./d1/siteConfig", async importOriginal => ({ ...await importOriginal<typeof import("./d1/siteConfig")>(), saveHotelSiteConfig: mocks.save, publishHotelSiteConfig: mocks.publish }));
vi.mock("./d1/hotel", async importOriginal => ({ ...await importOriginal<typeof import("./d1/hotel")>(), getManagedHotel: mocks.getHotel }));

const HOTEL_A = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
const HOTEL_B = "89ed76e4-cc93-4aa7-9c4d-30999d35ada4";

async function caller(hotelId: string, userId: string) {
  const { appRouter } = await import("./routers");
  const role = "hotel_owner" as const;
  const permissions = resolveMembershipPermissions(role, {});
  return appRouter.createCaller({
    req: {} as Request, res: {} as Response, db: {} as any,
    caller: { userId, roles: [role], access: "authenticated" },
    user: { id: userId, email: "owner@example.test", name: "Owner", accessToken: "token", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId, role, permissions }] },
  } as never);
}

beforeEach(() => { vi.clearAllMocks(); mocks.getHotel.mockResolvedValue({ id: HOTEL_A }); mocks.save.mockResolvedValue({ hotelId: HOTEL_A, draftJson: "{}" }); mocks.publish.mockResolvedValue({ publishedAt: new Date() }); });

describe("website draft and publish access", () => {
  it("allows the hotel's owner to save a draft and publish it", async () => {
    const app = await caller(HOTEL_A, "owner-a");
    await expect(app.channelManager.saveHotelSiteConfig({ hotel_id: HOTEL_A, hero_copy: "Draft" })).resolves.toMatchObject({ draftJson: "{}" });
    await expect(app.channelManager.publishHotelSiteConfig({ hotel_id: HOTEL_A })).resolves.toHaveProperty("publishedAt");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledOnce();
  }, 20000);

  it("forbids another hotel's owner before either mutation runs", async () => {
    const app = await caller(HOTEL_B, "owner-b");
    await expect(app.channelManager.saveHotelSiteConfig({ hotel_id: HOTEL_A, hero_copy: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.channelManager.publishHotelSiteConfig({ hotel_id: HOTEL_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  }, 20000);
});
