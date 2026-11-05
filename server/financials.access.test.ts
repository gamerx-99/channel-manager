import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@shared/authorization';
import { resolveMembershipPermissions, resolveSupportGrantPermissions } from '@shared/permissions';

const hotelMocks = vi.hoisted(() => ({
  listManagedHotelsForFinancials: vi.fn(),
}));

vi.mock('./d1/hotel', () => hotelMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager' | 'support', grants: Permission[] = []) {
  const permissions = role === 'support' ? resolveSupportGrantPermissions({ canEdit: true }) : resolveMembershipPermissions(role, { grants });
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
      memberships: [{ hotelId: HOME_HOTEL, role, permissions }],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('financials access follows the owner and the owner\'s per-person switch', () => {
  it('lets staff read the report once the owner switches it on', async () => {
    hotelMocks.listManagedHotelsForFinancials.mockResolvedValueOnce([]);
    const app = await caller('revenue_manager', ['property.view_financials']);

    await expect(app.channelManager.financials()).resolves.toMatchObject({ totals: { hotelCount: 0 } });
    expect(hotelMocks.listManagedHotelsForFinancials).toHaveBeenCalled();
  });

  it('passes the chosen month through, and refuses a period over 366 days before touching any data', async () => {
    hotelMocks.listManagedHotelsForFinancials.mockResolvedValueOnce([]);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.financials({ month: '2026-02' })).resolves.toMatchObject({ periodStart: '2026-02-01', periodEnd: '2026-02-28', periodLabel: 'month', bookings: [] });
    await expect(app.channelManager.financials({ from: '2026-01-01', to: '2027-01-02' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(hotelMocks.listManagedHotelsForFinancials).toHaveBeenCalledTimes(1);
  });

  it.each(['support', 'super_admin', 'admin', 'revenue_manager'] as const)('still denies %s when a period is chosen', async (role) => {
    const app = await caller(role);

    await expect(app.channelManager.financials({ month: '2026-02' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

  it('denies a support key even though it carries the permission', async () => {
    const app = await caller('support');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

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
