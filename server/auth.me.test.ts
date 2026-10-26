import { describe, expect, it } from 'vitest';

describe('auth.me', () => {
  it('never contains accessToken', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: {
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        accessToken: 'secret-token',
        appMetadata: {},
        userMetadata: {},
        role: 'hotel_owner',
        roles: ['hotel_owner'],
        memberships: [],
      },
    });
    const result = await app.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).accessToken).toBeUndefined();
  });
});