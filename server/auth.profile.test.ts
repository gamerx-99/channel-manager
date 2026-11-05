import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 10000 });

const mocks = vi.hoisted(() => ({ getAccountProfile: vi.fn() }));
vi.mock("./d1/accountProfile", () => mocks);

const { appRouter } = await import("./routers");

const USER_ID = "d93900a0-e7fe-45d6-9364-80ea8a035322";

function caller(user: unknown) {
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: user as never,
    db: {} as any,
    caller: user ? { userId: USER_ID, roles: ["hotel_owner"], access: "authenticated" } as any : undefined,
  });
}

const signedIn = { id: USER_ID, email: "owner@example.com", name: "Owner", accessToken: "t", appMetadata: {}, userMetadata: {}, role: "hotel_owner", roles: ["hotel_owner"], memberships: [] };

beforeEach(() => mocks.getAccountProfile.mockReset());

describe("auth.profile (router)", () => {
  it("returns the profile of the signed-in account, reading the id from the session", async () => {
    mocks.getAccountProfile.mockResolvedValueOnce({ id: USER_ID, ownedHotels: [] });
    await expect(caller(signedIn).auth.profile()).resolves.toMatchObject({ id: USER_ID });
    expect(mocks.getAccountProfile).toHaveBeenCalledTimes(1);
    expect(mocks.getAccountProfile).toHaveBeenCalledWith({}, { userId: USER_ID, roles: ["hotel_owner"], access: "authenticated" }, USER_ID);
  });

  it("rejects a visitor who is not signed in before reading anything", async () => {
    await expect(caller(null).auth.profile()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getAccountProfile).not.toHaveBeenCalled();
  });

  it("takes no input, so a request cannot ask for another account", async () => {
    mocks.getAccountProfile.mockResolvedValueOnce({ id: USER_ID });
    await (caller(signedIn).auth.profile as unknown as (input: unknown) => Promise<unknown>)({ userId: "someone-else" });
    expect(mocks.getAccountProfile.mock.calls[0]?.[2]).toBe(USER_ID);
  });
});
