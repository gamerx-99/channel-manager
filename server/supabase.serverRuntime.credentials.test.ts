import { describe, expect, it } from "vitest";

const serverUrl =
  process.env.CHANNEL_MANAGER_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL;
const serverAnonKey =
  process.env.CHANNEL_MANAGER_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

describe("server-only Supabase runtime credentials", () => {
  it("can reach the configured PostgREST endpoint with the server RLS anon key", async () => {
    expect(
      serverUrl,
      "CHANNEL_MANAGER_SUPABASE_URL, VITE_SUPABASE_URL, or SUPABASE_URL must be set"
    ).toBeTruthy();
    expect(
      serverAnonKey,
      "CHANNEL_MANAGER_SUPABASE_ANON_KEY, VITE_SUPABASE_ANON_KEY, or SUPABASE_ANON_KEY must be set"
    ).toBeTruthy();

    const response = await fetch(
      `${serverUrl!.replace(/\/$/, "")}/rest/v1/hotels?select=id&limit=1`,
      {
        headers: {
          apikey: serverAnonKey!,
          Authorization: `Bearer ${serverAnonKey!}`,
        },
      }
    );

    expect(response.status, await response.text()).toBe(200);
  }, 15_000);
});
