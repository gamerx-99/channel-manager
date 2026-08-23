import { describe, expect, it } from "vitest";

describe('Supabase browser credentials', () => {
  it('accepts the configured publishable key for an RLS-constrained table resource', async () => {
    const projectUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

    expect(projectUrl, 'VITE_SUPABASE_URL or SUPABASE_URL must be configured').toBeTruthy();
    expect(anonKey, 'VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY must be configured').toBeTruthy();

    const response = await fetch(`${projectUrl!.replace(/\/$/, '')}/rest/v1/hotels?select=id&limit=1`, {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${anonKey!}`,
      },
    });

    expect(response.status, `Supabase hotels endpoint returned ${response.status}`).toBe(200);
    expect(await response.json()).toEqual([]);
  }, 15_000);
});
