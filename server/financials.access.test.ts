import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hotelMocks = vi.hoisted(() => ({
  listManagedHotelsForFinancials: vi.fn(),
}));

vi.mock('./d1/hotel', () => hotelMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager') {
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
      memberships: [{ hotelId: HOME_HOTEL, role }],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('financials access is withheld from every role except hotel_owner', () => {
  it('lets hotel_owner read its own revenue report', async () => {
    hotelMocks.listManagedHotelsForFinancials.mockResolvedValueOnce([]);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.financials()).resolves.toMatchObject({ totals: { hotelCount: 0 } });
    expect(hotelMocks.listManagedHotelsForFinancials).toHaveBeenCalled();
  });

  it('denies super_admin, even though it bypasses hotel-scoped RLS elsewhere', async () => {
    const app = await caller('super_admin');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

  it('denies the read-only platform admin role', async () => {
    const app = await caller('admin');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

  it('denies revenue_manager', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });
});
