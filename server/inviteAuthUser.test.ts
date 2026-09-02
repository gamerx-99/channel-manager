import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inviteUserByEmailMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: inviteUserByEmailMock,
      },
    },
  })),
}));

import { inviteAuthUser } from './supabase';

describe('inviteAuthUser redirectTo configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('passes redirectTo using PUBLIC_APP_URL when configured', async () => {
    process.env.PUBLIC_APP_URL = 'https://custom-hotel-domain.com';
    inviteUserByEmailMock.mockResolvedValueOnce({
      data: { user: { id: 'usr-123', email: 'staff@example.com' } },
      error: null,
    });

    const result = await inviteAuthUser('staff@example.com');

    expect(result).toEqual({ id: 'usr-123', email: 'staff@example.com' });
    expect(inviteUserByEmailMock).toHaveBeenCalledWith('staff@example.com', {
      redirectTo: 'https://custom-hotel-domain.com/accept-invite',
    });
  });

  it('falls back to default production domain when PUBLIC_APP_URL is unset in production', async () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.NODE_ENV = 'production';
    inviteUserByEmailMock.mockResolvedValueOnce({
      data: { user: { id: 'usr-456', email: 'staff2@example.com' } },
      error: null,
    });

    const result = await inviteAuthUser('staff2@example.com');

    expect(result).toEqual({ id: 'usr-456', email: 'staff2@example.com' });
    expect(inviteUserByEmailMock).toHaveBeenCalledWith('staff2@example.com', {
      redirectTo: 'https://channel-manager-seven-blue.vercel.app/accept-invite',
    });
  });

  it('falls back to localhost:3000 in development when PUBLIC_APP_URL is unset', async () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.NODE_ENV = 'development';
    inviteUserByEmailMock.mockResolvedValueOnce({
      data: { user: { id: 'usr-789', email: 'dev@example.com' } },
      error: null,
    });

    const result = await inviteAuthUser('dev@example.com');

    expect(result).toEqual({ id: 'usr-789', email: 'dev@example.com' });
    expect(inviteUserByEmailMock).toHaveBeenCalledWith('dev@example.com', {
      redirectTo: 'http://localhost:3000/accept-invite',
    });
  });

  it('throws error when invite fails', async () => {
    inviteUserByEmailMock.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'INVITE_FAILED', message: 'User already registered' },
    });

    await expect(inviteAuthUser('existing@example.com')).rejects.toThrow('INVITE_FAILED: User already registered');
  });
});
