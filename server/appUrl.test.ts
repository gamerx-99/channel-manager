import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppUrl } from "./appUrl";

afterEach(() => vi.unstubAllEnvs());

describe("resolveAppUrl", () => {
  it("uses an explicit request/configuration origin before defaults", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://configured.example.test");
    expect(resolveAppUrl("https://request.example.test")).toBe("https://request.example.test");
  });

  it("uses PUBLIC_APP_URL when no explicit origin is passed", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://configured.example.test");
    expect(resolveAppUrl()).toBe("https://configured.example.test");
  });

  it("uses the production Hayhost origin instead of the retired Vercel host", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveAppUrl()).toBe("https://www.hayhostth.com");
  });
});
