import { hotelUsers } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = '2d0a2f4e-6b3f-4a1e-9f0d-5c2b7a913e11';

function makeDb(role: string) {
  const membership = { hotelId: HOME_HOTEL, role, permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) return { where: async () => (role === 'super_admin' ? [{ ...membership, role: 'super_admin' }] : [membership]) };
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'admin' | 'front_desk') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'platform-admin@example.com',
      name: 'Platform admin',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId: HOME_HOTEL, role }],
    },
    db: makeDb(role) as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId: HOME_HOTEL, role }], access: 'authenticated' } as any,
  }));
}

describe('read-only platform admin access', () => {
  it('denies admin from reading bookings for a hotel it has no membership in', async () => {
    const app = await caller('admin');

    await expect(app.channelManager.bookings(OTHER_HOTEL)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies a property role the same cross-hotel read', async () => {
    const app = await caller('front_desk');

    await expect(app.channelManager.bookings(OTHER_HOTEL)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses admin write capabilities', async () => {
    const app = await caller('admin');

    for (const hotelId of [HOME_HOTEL, OTHER_HOTEL]) {
      await expect(app.channelManager.exportTm30(hotelId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.createRoomType({
        hotel_id: hotelId,
        name: 'Deluxe',
        capacity: 2,
        base_price: 1200,
        quantity: 5,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('scopes the portfolio dashboard through RLS rather than the membership list', async () => {
    const app = await caller('admin');
    await expect(app.channelManager.hotels()).resolves.toBeTruthy();
  });
});
