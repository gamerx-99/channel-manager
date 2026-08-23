import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getManagedHotel } from './db';

describe('getManagedHotel', () => {
  it('returns null rather than throwing PGRST116 when RLS hides the requested hotel', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient;

    await expect(getManagedHotel(client, '88ed76e4-cc93-4aa7-9c4d-30999d35ada4')).resolves.toBeNull();
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
});
