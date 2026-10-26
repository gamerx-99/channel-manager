import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createContextFromRequest } from "../server/_core/context";

let app: Awaited<ReturnType<typeof loadApp>>;

async function loadApp() {
  const { createWorkerApp } = await import("./app");
  return createWorkerApp();
}

beforeAll(async () => {
  // The router graph is large; the cold import alone can take several seconds.
  app = await loadApp();
}, 30_000);

describe("worker app", () => {
  it("serves tRPC queries through the fetch adapter", async () => {
    const input = encodeURIComponent(JSON.stringify({ json: { timestamp: 1 } }));
    const res = await app.request(`/api/trpc/system.health?input=${input}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { data: { json: { ok: boolean } } } };
    expect(body.result.data.json).toEqual({ ok: true });
  });

  it("rejects protected procedures without a bearer token", async () => {
    const res = await app.request("/api/trpc/channelManager.ota.summary");

    expect(res.status).toBe(401);
  });

  it("returns 404 for malformed iCal export tokens without querying the database", async () => {
    const res = await app.request("/api/ical/not-a-token.ics");

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Calendar not found.");
  });

  it("returns JSON 404 for unknown API routes instead of the SPA shell", async () => {
    const res = await app.request("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("createContextFromRequest", () => {
  it("keeps the client IP for rate limiting when no user is signed in", async () => {
    await expect(createContextFromRequest(undefined, "203.0.113.7")).resolves.toEqual({
      user: null,
      clientIp: "203.0.113.7",
    });
  });

  it("falls back to a shared bucket when the IP is unknown", async () => {
    await expect(createContextFromRequest(null, undefined)).resolves.toEqual({
      user: null,
      clientIp: "unknown",
    });
  });
});

describe("wrangler.toml", () => {
  const config = readFileSync(resolve(import.meta.dirname, "..", "wrangler.toml"), "utf8");

  it("routes only the API to the Worker and serves the SPA from static assets", () => {
    expect(config).toContain('main = "worker/index.ts"');
    expect(config).toContain('directory = "./dist/public"');
    expect(config).toContain('not_found_handling = "single-page-application"');
    expect(config).toContain('run_worker_first = ["/api/*"]');
  });

  it("enables nodejs_compat and declares D1 and R2 for every environment", () => {
    expect(config).toContain('compatibility_flags = ["nodejs_compat"]');
    expect(config).toContain("[[env.staging.d1_databases]]");
    expect(config).toContain("[[env.production.d1_databases]]");
    expect(config).toContain("[[env.staging.r2_buckets]]");
    expect(config).toContain("[[env.production.r2_buckets]]");
    expect(config).toContain('PUBLIC_APP_URL = "https://www.hayhostth.com"');
  });
});
