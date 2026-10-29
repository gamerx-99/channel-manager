import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock supabase module dynamically to test both null and initialized states
const mockSupabase = vi.hoisted(() => ({
  client: null as any,
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mockSupabase.client;
  },
}));

vi.mock("./lib/supabase", () => ({
  get supabase() {
    return mockSupabase.client;
  },
}));

import { getTrpcHeaders, createTrpcClient, trpcClient } from "./main";

describe("tRPC Client Bootstrap Regression (Ticket 13-07)", () => {
  beforeEach(() => {
    mockSupabase.client = null;
    vi.clearAllMocks();
  });

  it("creates trpcClient instance cleanly when supabase is strictly null", () => {
    expect(mockSupabase.client).toBeNull();
    const client = createTrpcClient();
    expect(client).toBeDefined();
    expect(trpcClient).toBeDefined();
  });

  it("getTrpcHeaders returns empty object without throwing when supabase is null", async () => {
    mockSupabase.client = null;
    let headersResult: Record<string, string> | null = null;
    let caughtError: unknown = null;

    try {
      headersResult = await getTrpcHeaders();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeNull();
    expect(headersResult).toEqual({});
  });

  it("getTrpcHeaders returns Authorization header when supabase session is present", async () => {
    mockSupabase.client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "mock-supabase-jwt-token-xyz",
            },
          },
          error: null,
        }),
      },
    };

    const headers = await getTrpcHeaders();
    expect(headers).toEqual({
      Authorization: "Bearer mock-supabase-jwt-token-xyz",
    });
  });

  it("getTrpcHeaders returns empty object when supabase session is absent", async () => {
    mockSupabase.client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    };

    const headers = await getTrpcHeaders();
    expect(headers).toEqual({});
  });

  it("getTrpcHeaders catches unhandled supabase errors and safely returns empty object", async () => {
    mockSupabase.client = {
      auth: {
        getSession: vi.fn().mockRejectedValue(new Error("Supabase network failure")),
      },
    };

    const headers = await getTrpcHeaders();
    expect(headers).toEqual({});
  });

  it("contract: main.tsx uses getTrpcHeaders, null guard, and credentials include", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const mainSrc = fs.readFileSync(path.resolve(import.meta.dirname, "main.tsx"), "utf-8");

    expect(mainSrc).toMatch(/if\s*\(!supabase\)\s*return\s*\{\};/);
    expect(mainSrc).toContain('credentials: "include"');
    expect(mainSrc).toContain("headers: getTrpcHeaders");
    expect(mainSrc).not.toMatch(/async headers\(\)\s*\{\s*const.*= await supabase\.auth\.getSession\(\);/);
  });

  it("asserts zero un-guarded supabase.auth calls exist across client/src", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    function findFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(findFiles(fullPath));
        } else if (/\.(ts|tsx)$/.test(file) && !/\.(test|spec)\./.test(file)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const clientSrc = path.resolve(import.meta.dirname, ".");
    const tsFiles = findFiles(clientSrc);

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes("supabase.auth")) {
        // Only main.tsx is allowed to reference supabase.auth, and it MUST guard with if (!supabase)
        expect(filePath.replace(/\\/g, "/")).toContain("client/src/main.tsx");
        expect(content).toContain("if (!supabase) return {};");
      }
    }
  });
});
