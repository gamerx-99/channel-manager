import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  listManagedHotelsForFinancials: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

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
  }));
}

describe('financials access is withheld from every role except hotel_owner', () => {
  it('lets hotel_owner read its own revenue report', async () => {
    dbMocks.listManagedHotelsForFinancials.mockResolvedValueOnce([]);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.financials()).resolves.toMatchObject({ totals: { hotelCount: 0 } });
    expect(dbMocks.listManagedHotelsForFinancials).toHaveBeenCalledWith({ requestScoped: true });
  });

  it('denies super_admin, even though it bypasses hotel-scoped RLS elsewhere', async () => {
    const app = await caller('super_admin');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

  it('denies the read-only platform admin role', async () => {
    const app = await caller('admin');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });

  it('denies revenue_manager', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listManagedHotelsForFinancials).not.toHaveBeenCalled();
  });
});
