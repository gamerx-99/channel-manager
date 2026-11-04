import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { TRPCError } from "@trpc/server";

const mediaMocks = vi.hoisted(() => ({
  setHotelMediaCaption: vi.fn(),
  setHotelMediaGallerySelection: vi.fn(),
}));

vi.mock("./d1/siteConfig", () => mediaMocks);

const HOTEL_ID = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
const MEDIA_ID = "d93900a0-e7fe-45d6-9364-80ea8a035322";

async function caller(role: "hotel_owner" | "front_desk") {
  const permissions = resolveMembershipPermissions(role, { grants: [] as Permission[] });
  const { appRouter } = await import("./routers");
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: { id: MEDIA_ID, email: "test@example.com", name: "Test", accessToken: "token", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId: HOTEL_ID, role, permissions }] },
    db: {} as any,
    caller: { userId: MEDIA_ID, roles: [role], access: "authenticated" } as any,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("website photo router permissions", () => {
  it("rejects caption and selection changes without property.manage_profile", async () => {
    const app = await caller("front_desk");
    await expect(app.channelManager.setHotelMediaCaption({ hotel_id: HOTEL_ID, media_id: MEDIA_ID, caption: "Garden" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.channelManager.setHotelMediaGallerySelection({ hotel_id: HOTEL_ID, media_id: MEDIA_ID, shown: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mediaMocks.setHotelMediaCaption).not.toHaveBeenCalled();
    expect(mediaMocks.setHotelMediaGallerySelection).not.toHaveBeenCalled();
  });

  it("passes owner selection to the server limit rule", async () => {
    mediaMocks.setHotelMediaGallerySelection.mockRejectedValueOnce(new TRPCError({ code: "BAD_REQUEST", message: "A maximum of six gallery photos can be shown." }));
    const app = await caller("hotel_owner");
    await expect(app.channelManager.setHotelMediaGallerySelection({ hotel_id: HOTEL_ID, media_id: MEDIA_ID, shown: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mediaMocks.setHotelMediaGallerySelection).toHaveBeenCalledWith(expect.anything(), expect.anything(), HOTEL_ID, MEDIA_ID, true);
  });
});
