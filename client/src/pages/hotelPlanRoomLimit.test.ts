import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { roomTypePlanLimit } from "./hotelPlanRoomLimit";

describe("roomTypePlanLimit", () => {
  it("counts the held-back rooms of one room type", () => {
    expect(roomTypePlanLimit(["a", "b", "c"], ["c", "x"])).toEqual({ heldBack: 1, sellable: 2, total: 3, allHeldBack: false });
  });

  it("greys out a room type only when all of its rooms are held back", () => {
    expect(roomTypePlanLimit(["d", "e"], ["d", "e"]).allHeldBack).toBe(true);
    expect(roomTypePlanLimit([], ["d"]).allHeldBack).toBe(false);
  });

  it("holds nothing back while the limit is unknown or empty", () => {
    expect(roomTypePlanLimit(["a"], undefined)).toEqual({ heldBack: 0, sellable: 1, total: 1, allHeldBack: false });
  });
});

describe("room types page shows the Free plan limit", () => {
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/HotelDetail.tsx"), "utf8");
  const router = readFileSync(resolve(process.cwd(), "server/routers/hotelRouter.ts"), "utf8");

  it("asks the server which rooms are held back and marks them", () => {
    expect(page).toContain("trpc.channelManager.planRoomLimit.useQuery(id");
    expect(page).toContain("is-plan-capped");
    expect(page).toContain("t('planRoomLimit.rowNote'");
    expect(page).toContain('data-testid="plan-room-limit-banner"');
    expect(page).toContain("`/hotels/${hotel.id}/billing`");
  });

  it("lets anyone who can view the hotel read the limit", () => {
    expect(router).toMatch(/export const planRoomLimit = protectedProcedure[\s\S]{0,200}requireHotelPermission\(ctx\.user, input, 'property\.view'\)/);
  });
});
