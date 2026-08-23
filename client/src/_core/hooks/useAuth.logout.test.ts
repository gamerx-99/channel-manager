import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut },
  },
}));

import { signOutCurrentSupabaseSession } from './useAuth';

describe('signOutCurrentSupabaseSession', () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it('revokes the Supabase browser session and signals the hook to clear its user state on success', async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(signOutCurrentSupabaseSession()).resolves.toEqual({ error: null, clearUser: true });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('preserves the user state decision and exposes the error when Supabase rejects sign-out', async () => {
    const signOutError = new Error('Network unavailable');
    signOut.mockResolvedValue({ error: signOutError });

    await expect(signOutCurrentSupabaseSession()).resolves.toEqual({ error: signOutError, clearUser: false });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
