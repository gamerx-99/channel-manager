import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut,
  },
}));

import { signOutCurrentSession, signOutCurrentSupabaseSession } from './useAuth';

describe('signOutCurrentSession & signOutCurrentSupabaseSession', () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it('revokes the browser session and signals the hook to clear user state on success', async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(signOutCurrentSession()).resolves.toEqual({ error: null, clearUser: true });
    await expect(signOutCurrentSupabaseSession()).resolves.toEqual({ error: null, clearUser: true });
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it('preserves user state decision and exposes the error when sign-out fails', async () => {
    const signOutError = new Error('Network unavailable');
    signOut.mockResolvedValue({ error: signOutError });

    await expect(signOutCurrentSession()).resolves.toEqual({ error: signOutError, clearUser: false });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
