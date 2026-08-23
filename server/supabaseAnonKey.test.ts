import { describe, expect, it } from 'vitest';

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

describe('Supabase browser credentials', () => {
  it('can make an RLS-constrained read using the anon key', async () => {
    expect(supabaseUrl).toBeTruthy();
    expect(anonKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl}/rest/v1/hotels?select=id&limit=1`, {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${anonKey!}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
