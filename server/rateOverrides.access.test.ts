import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
  listRateOverrides: vi.fn(),
  createRateOverride: vi.fn(),
  deleteRateOverride: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_TYPE_ID = '11111111-1111-4111-8111-111111111111';
const OVERRIDE_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getManagedHotel.mockResolvedValue({
    id: HOME_HOTEL,
    name: 'Test Hotel',
    room_types: [{ id: ROOM_TYPE_ID, hotel_id: HOME_HOTEL, name: 'Deluxe', capacity: 2, base_price: 100 }],
    rooms: [],
  });
});

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager' | 'front_desk' | 'housekeeping') {
  return import('./routers').then(({ appRouter }) =>
    appRouter.createCaller({
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
    }),
  );
}

const validCreateInput = {
  hotel_id: HOME_HOTEL,
  room_type_id: ROOM_TYPE_ID,
  start_date: '2026-09-01',
  end_date: '2026-09-10',
  override_price: 250,
  min_stay_nights: 2 as number | null,
};

describe('rate overrides access — revenue.manage_pricing_rules', () => {
  it('lets hotel_owner create, list, and delete rate overrides', async () => {
    dbMocks.createRateOverride.mockResolvedValueOnce({ id: OVERRIDE_ID, ...validCreateInput, created_at: new Date().toISOString() });
    dbMocks.listRateOverrides.mockResolvedValueOnce([]);
    dbMocks.deleteRateOverride.mockResolvedValueOnce({ id: OVERRIDE_ID });

    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRateOverride(validCreateInput)).resolves.toMatchObject({ id: OVERRIDE_ID });
    expect(dbMocks.createRateOverride).toHaveBeenCalledOnce();

    await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    expect(dbMocks.listRateOverrides).toHaveBeenCalledWith({ mocked: true }, { hotel_id: HOME_HOTEL });

    await expect(app.channelManager.deleteRateOverride({ hotel_id: HOME_HOTEL, rate_override_id: OVERRIDE_ID })).resolves.toMatchObject({
      success: true,
    });
    expect(dbMocks.deleteRateOverride).toHaveBeenCalledWith({ mocked: true }, OVERRIDE_ID);
  });

  it('lets revenue_manager manage rate overrides via hotel membership', async () => {
    dbMocks.createRateOverride.mockResolvedValueOnce({ id: OVERRIDE_ID, ...validCreateInput, created_at: new Date().toISOString() });
    const app = await caller('revenue_manager');

    await expect(app.channelManager.createRateOverride(validCreateInput)).resolves.toMatchObject({ id: OVERRIDE_ID });
    expect(dbMocks.createRateOverride).toHaveBeenCalledOnce();
  });

  it('lets super_admin bypass hotel permission for rate overrides', async () => {
    dbMocks.listRateOverrides.mockResolvedValueOnce([]);
    const app = await caller('super_admin');

    await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    expect(dbMocks.listRateOverrides).toHaveBeenCalledOnce();
  });

  it('denies housekeeping, front_desk, and read-only platform admin', async () => {
    for (const role of ['housekeeping', 'front_desk', 'admin'] as const) {
      const app = await caller(role);
      await expect(app.channelManager.createRateOverride(validCreateInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.deleteRateOverride({ hotel_id: HOME_HOTEL, rate_override_id: OVERRIDE_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    expect(dbMocks.createRateOverride).not.toHaveBeenCalled();
    expect(dbMocks.listRateOverrides).not.toHaveBeenCalled();
    expect(dbMocks.deleteRateOverride).not.toHaveBeenCalled();
  });

  it('surfaces CONFLICT when an overlapping range is created (app-level guard)', async () => {
    dbMocks.createRateOverride.mockRejectedValueOnce(new Error('23P01: This room type already has a rate override overlapping the selected dates.'));
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRateOverride(validCreateInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('surfaces CONFLICT when the EXCLUDE constraint fires', async () => {
    dbMocks.createRateOverride.mockRejectedValueOnce(new Error('23P01: prevent_rate_override_overlap'));
    const app = await caller('revenue_manager');

    await expect(app.channelManager.createRateOverride(validCreateInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('returns NOT_FOUND when deleting a non-existent override', async () => {
    dbMocks.deleteRateOverride.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.deleteRateOverride({ hotel_id: HOME_HOTEL, rate_override_id: OVERRIDE_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
