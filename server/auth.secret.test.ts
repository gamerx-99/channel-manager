import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthSecret } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("resolveAuthSecret", () => {
  it("refuses to run deployed without a secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => resolveAuthSecret()).toThrow("BETTER_AUTH_SECRET is not configured.");
  });

  it("refuses when the environment is not named at all", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "");

    expect(() => resolveAuthSecret()).toThrow("BETTER_AUTH_SECRET is not configured.");
  });

  it("uses the configured secret in production", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "configured-secret");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveAuthSecret()).toBe("configured-secret");
    expect(resolveAuthSecret("explicit-secret")).toBe("explicit-secret");
  });

  it("allows the local fallback only in development and test", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveAuthSecret()).toContain("dev-insecure");
  });
});
