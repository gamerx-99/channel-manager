import { describe, expect, it } from "vitest";
import { createRlsSupabaseClient } from './supabase';

describe('Supabase server RLS client credentials', () => {
  it('uses the configured publishable key to perform an RLS-constrained PostgREST read', async () => {
    const { data, error, status } = await createRlsSupabaseClient()
      .from('hotels')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(data).toEqual([]);
  }, 15_000);
});
