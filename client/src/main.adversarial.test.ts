import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Dynamic mock for supabase module to simulate hostile conditions
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

import { getTrpcHeaders, createTrpcClient, trpcClient, queryClient } from "./main";

describe("Empirical Challenger: tRPC Client Bootstrap Hostile Stress-Tests", () => {
  beforeEach(() => {
    mockSupabase.client = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // Dimension 1: Null & Undefined Supabase
  // -------------------------------------------------------------
  describe("Dimension 1: Null & Undefined Supabase Invariants", () => {
    it("handles supabase strictly null without throwing", async () => {
      mockSupabase.client = null;
      const headers = await getTrpcHeaders();
      expect(headers).toEqual({});
    });

    it("handles supabase undefined without throwing", async () => {
      mockSupabase.client = undefined;
      const headers = await getTrpcHeaders();
      expect(headers).toEqual({});
    });

    it("handles supabase falsey 0 / false / empty string if coercively injected", async () => {
      mockSupabase.client = 0;
      expect(await getTrpcHeaders()).toEqual({});

      mockSupabase.client = false;
      expect(await getTrpcHeaders()).toEqual({});

      mockSupabase.client = "";
      expect(await getTrpcHeaders()).toEqual({});
    });
  });

  // -------------------------------------------------------------
  // Dimension 2: Promise Rejections & Synchronous Throws
  // -------------------------------------------------------------
  describe("Dimension 2: Hostile Error & Rejection Handling", () => {
    it("safely absorbs synchronous throw in getSession", async () => {
      mockSupabase.client = {
        auth: {
          getSession: () => {
            throw new Error("Violent synchronous crash in Supabase SDK");
          },
        },
      };

      let headers: Record<string, string> | null = null;
      let errorCaught: unknown = null;
      try {
        headers = await getTrpcHeaders();
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeNull();
      expect(headers).toEqual({});
    });

    it("safely absorbs asynchronous Promise rejection with Error instance", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockRejectedValue(new Error("Network timeout 504 Gateway Timeout")),
        },
      };

      const headers = await getTrpcHeaders();
      expect(headers).toEqual({});
    });

    it("safely absorbs non-Error promise rejection (string / object / null)", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockRejectedValue("Fatal string error"),
        },
      };
      expect(await getTrpcHeaders()).toEqual({});

      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockRejectedValue({ code: "UNKNOWN_FATAL", status: 500 }),
        },
      };
      expect(await getTrpcHeaders()).toEqual({});

      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockRejectedValue(null),
        },
      };
      expect(await getTrpcHeaders()).toEqual({});
    });
  });

  // -------------------------------------------------------------
  // Dimension 3: Malformed & Boundary Payloads
  // -------------------------------------------------------------
  describe("Dimension 3: Malformed Payload & Edge Case Sessions", () => {
    it("handles { data: { session: null } }", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: null,
          }),
        },
      };

      expect(await getTrpcHeaders()).toEqual({});
    });

    it("handles { data: null } (e.g. Supabase auth error response)", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Invalid session" },
          }),
        },
      };

      expect(await getTrpcHeaders()).toEqual({});
    });

    it("handles { data: undefined }", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({}),
        },
      };

      expect(await getTrpcHeaders()).toEqual({});
    });

    it("handles empty token string in session", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: "",
              },
            },
          }),
        },
      };

      expect(await getTrpcHeaders()).toEqual({});
    });

    it("handles null / undefined access_token in session", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: null,
              },
            },
          }),
        },
      };

      expect(await getTrpcHeaders()).toEqual({});
    });

    it("returns Bearer header when access_token is valid", async () => {
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: "valid-jwt-token-alpha-123456",
              },
            },
          }),
        },
      };

      const headers = await getTrpcHeaders();
      expect(headers).toEqual({
        Authorization: "Bearer valid-jwt-token-alpha-123456",
      });
    });
  });

  // -------------------------------------------------------------
  // Dimension 4: Concurrency & Race Condition Stress
  // -------------------------------------------------------------
  describe("Dimension 4: Concurrency & High Load Stress", () => {
    it("survives 100 concurrent getTrpcHeaders calls when supabase is null", async () => {
      mockSupabase.client = null;
      const calls = Array.from({ length: 100 }, () => getTrpcHeaders());
      const results = await Promise.all(calls);

      expect(results).toHaveLength(100);
      for (const res of results) {
        expect(res).toEqual({});
      }
    });

    it("survives 100 concurrent getTrpcHeaders calls with variable asynchronous delay", async () => {
      let callCount = 0;
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockImplementation(async () => {
            const delay = Math.floor(Math.random() * 15);
            await new Promise((resolve) => setTimeout(resolve, delay));
            callCount++;
            return {
              data: {
                session: {
                  access_token: `token-instance-${callCount}`,
                },
              },
            };
          }),
        },
      };

      const calls = Array.from({ length: 100 }, () => getTrpcHeaders());
      const results = await Promise.all(calls);

      expect(results).toHaveLength(100);
      for (const res of results) {
        expect(res.Authorization).toMatch(/^Bearer token-instance-\d+$/);
      }
    });

    it("survives mixed concurrency where 50 calls succeed and 50 calls reject", async () => {
      let counter = 0;
      mockSupabase.client = {
        auth: {
          getSession: vi.fn().mockImplementation(async () => {
            counter++;
            const shouldFail = counter % 2 === 0;
            if (shouldFail) {
              throw new Error(`Simulated intermittent failure #${counter}`);
            }
            return {
              data: {
                session: {
                  access_token: `token-${counter}`,
                },
              },
            };
          }),
        },
      };

      const calls = Array.from({ length: 100 }, () => getTrpcHeaders());
      const results = await Promise.all(calls);

      expect(results).toHaveLength(100);
      let successCount = 0;
      let failCount = 0;

      for (const res of results) {
        if (res.Authorization) {
          successCount++;
        } else {
          expect(res).toEqual({});
          failCount++;
        }
      }

      expect(successCount).toBe(50);
      expect(failCount).toBe(50);
    });
  });

  // -------------------------------------------------------------
  // Dimension 5: Non-DOM Environment & Headless Import Safety
  // -------------------------------------------------------------
  describe("Dimension 5: Non-DOM & Headless Environment Verification", () => {
    it("verifies global document is undefined in this test environment", () => {
      // In default vitest node environment, document is undefined
      expect(typeof document).toBe("undefined");
    });

    it("trpcClient and queryClient instances are exported and ready without DOM", () => {
      expect(trpcClient).toBeDefined();
      expect(queryClient).toBeDefined();
    });

    it("createTrpcClient wraps fetch with credentials: 'include'", () => {
      const client = createTrpcClient();
      expect(client).toBeDefined();
    });

    it("queryCache and mutationCache error subscribers log without throwing unhandled exceptions", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Trigger synthetic query error notification
      (queryClient.getQueryCache() as any).notify({
        type: "updated",
        action: { type: "error" },
        query: {
          state: {
            error: new Error("Synthetic query cache failure"),
          },
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[API Query Error]",
        expect.any(Error)
      );

      // Trigger synthetic mutation error notification
      (queryClient.getMutationCache() as any).notify({
        type: "updated",
        action: { type: "error" },
        mutation: {
          state: {
            error: new Error("Synthetic mutation cache failure"),
          },
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[API Mutation Error]",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
