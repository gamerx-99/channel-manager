import { describe, expect, it } from "vitest";
import { authRouter } from "./authRouter";

describe("auth.me", () => {
  it("never returns the session or access token to page scripts", async () => {
    const caller = authRouter.createCaller({
      user: { id: "u1", email: "u@example.test", roles: [], accessToken: "secret-token", session: { token: "session-token" } },
    } as any);

    const me = await caller.me();

    expect(me).toMatchObject({ id: "u1", email: "u@example.test" });
    expect(JSON.stringify(me)).not.toContain("secret-token");
    expect(JSON.stringify(me)).not.toContain("session-token");
  });
});
