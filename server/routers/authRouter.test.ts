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

describe("auth.socialProviders", () => {
  it("exposes configured provider names only, never OAuth credentials", async () => {
    const prior = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    delete process.env.FACEBOOK_CLIENT_ID;
    delete process.env.FACEBOOK_CLIENT_SECRET;
    delete process.env.LINE_CLIENT_ID;
    delete process.env.LINE_CLIENT_SECRET;
    try {
      const caller = authRouter.createCaller({} as any);
      const providers = await caller.socialProviders();
      expect(providers).toEqual(["google"]);
      expect(JSON.stringify(providers)).not.toContain("test-google-id");
      expect(JSON.stringify(providers)).not.toContain("test-google-secret");
    } finally {
      process.env = prior;
    }
  });
});
