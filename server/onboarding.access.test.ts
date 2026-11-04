import { describe, expect, it } from "vitest";
import { authRouter } from "./routers/authRouter";

const create = (user: { id: string } | null, rows: Map<string, any>) => {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.has(user?.id ?? "") ? [rows.get(user!.id)!] : [] }) }) }),
    insert: () => ({ values: (value: any) => ({ onConflictDoUpdate: ({ set }: any) => ({ returning: async () => { const row = { ...value, ...set }; rows.set(value.userId, row); return [row]; } }) }) }),
  };
  return authRouter.createCaller({ user, db, clientIp: "local", caller: { userId: user?.id }, auth: null, headers: new Headers() } as never);
};
describe("onboarding procedures", () => {
  it("reads and writes only the signed-in user's row", async () => {
    const rows = new Map([ ["other", { userId: "other", tourSkippedAt: new Date(1) }] ]);
    const caller = create({ id: "owner" }, rows);
    await expect(caller.onboardingStatus()).resolves.toEqual({ tourCompletedAt: null, tourSkippedAt: null });
    await caller.setOnboardingTourState({ state: "skipped" });
    expect(rows.has("owner")).toBe(true);
    expect(rows.get("other").tourSkippedAt).toEqual(new Date(1));
  });
  it("rejects unauthenticated reads and writes", async () => {
    const caller = create(null, new Map());
    await expect(caller.onboardingStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.setOnboardingTourState({ state: "completed" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
