import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'super_admin' = 'hotel_owner') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'user@example.com',
      name: 'Test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('rethrowDomainError TRPCError passthrough', () => {
  it('preserves FORBIDDEN thrown inside an unguarded try block instead of downgrading to INTERNAL_SERVER_ERROR', async () => {
    const app = await caller('hotel_owner');

    await expect(app.notifications.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
