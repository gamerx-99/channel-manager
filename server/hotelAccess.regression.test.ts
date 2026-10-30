import type { Request, Response } from 'express';
import { hotelUsers } from '../drizzle/d1-schema';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./d1/hotel', () => ({
  getManagedHotel: vi.fn().mockResolvedValue(null),
}));

describe('channelManager.hotel', () => {
  it('maps an RLS-hidden hotel UUID to NOT_FOUND rather than an internal server error', async () => {
    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
        email: 'cm-e2e-996d1e8b@msn.com',
        name: 'E2E hotel owner',
        accessToken: 'test-access-token',
        appMetadata: {},
        userMetadata: {},
        role: 'hotel_owner',
        roles: ['hotel_owner'],
        memberships: [{ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', role: 'hotel_owner' }],
      },
      db: {
        select: () => ({
          from: (table: any) => {
            if (table === hotelUsers) return { where: async () => [{ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', role: 'hotel_owner', permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' }] };
            return { where: () => ({ limit: async () => [] }) };
          },
        }),
      } as any,
      caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], memberships: [{ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', role: 'hotel_owner' }], access: 'authenticated' } as any,
    });

    await expect(caller.channelManager.hotel('88ed76e4-cc93-4aa7-9c4d-30999d35ada4')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This hotel is not available to your account.',
    });
  });
});
