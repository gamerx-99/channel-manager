import { describe, expect, it } from "vitest";
import { createAuth } from "./auth";

describe("LINE Login Better Auth integration", () => {
  it("registers LINE through the shared social-provider configuration", () => {
    const auth = createAuth({
      db: {} as any,
      secret: "dev-insecure-secret-minimum-32-chars-key!!",
      socialEnv: {
        LINE_CLIENT_ID: "fake-line-id-for-tests",
        LINE_CLIENT_SECRET: "fake-line-secret-for-tests",
      },
    });
    expect(auth.options.socialProviders?.line).toBeDefined();
    expect(auth.options.socialProviders?.line?.clientId).toBe("fake-line-id-for-tests");
  });
});
