import { hotelUsers } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const availabilityMocks = vi.hoisted(() => ({
  dbCreateRateOverride: vi.fn(),
  dbListRateOverrides: vi.fn(),
  dbDeleteRateOverride: vi.fn(),
}));

// map to actual exports
const mockedModule = {
  createRateOverride: availabilityMocks.dbCreateRateOverride,
  listRateOverrides: availabilityMocks.dbListRateOverrides,
  deleteRateOverride: availabilityMocks.dbDeleteRateOverride,
  listAvailabilityForHotel: vi.fn(),
  listBookingOccupancyForHotel: vi.fn(),
  updateAvailability: vi.fn(),
};

vi.mock('./d1/availability', () => mockedModule);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_TYPE_ID = '11111111-1111-4111-8111-111111111111';
const OVERRIDE_ID = '22222222-2222-4222-8222-222222222222';

function makeDb(role: string) {
  const membership = { hotelId: HOME_HOTEL, role, permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) return { where: async () => [membership] };
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  availabilityMocks.dbCreateRateOverride.mockResolvedValue({ id: OVERRIDE_ID });
  availabilityMocks.dbListRateOverrides.mockResolvedValue([]);
  availabilityMocks.dbDeleteRateOverride.mockResolvedValue({ id: OVERRIDE_ID });
});

function caller(role: string) {
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
    db: makeDb(role) as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId: HOME_HOTEL, role }], access: 'authenticated' } as any,
  }));
}

const validCreateInput = {
  hotel_id: HOME_HOTEL,
  room_type_id: ROOM_TYPE_ID,
  start_date: '2026-09-01',
  end_date: '2026-09-10',
  override_price: 250,
  min_stay_nights: 2,
};

describe('rate overrides access', () => {
  it('denies housekeeping, front_desk, and read-only platform admin', async () => {
    for (const role of ['housekeeping', 'front_desk', 'admin'] as const) {
      const app = await caller(role);
      await expect(app.channelManager.createRateOverride(validCreateInput as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.deleteRateOverride({ hotel_id: HOME_HOTEL, rate_override_id: OVERRIDE_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('allows hotel_owner to list', async () => {
    const app = await caller('hotel_owner');
    await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
  });

  it('allows revenue_manager to create', async () => {
    const app = await caller('revenue_manager');
    await expect(app.channelManager.createRateOverride(validCreateInput as any)).resolves.toMatchObject({ id: OVERRIDE_ID });
  });

  it('returns NOT_FOUND when deleting a non-existent override', async () => {
    availabilityMocks.dbDeleteRateOverride.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');
    await expect(app.channelManager.deleteRateOverride({ hotel_id: HOME_HOTEL, rate_override_id: OVERRIDE_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets super_admin bypass hotel permission for rate overrides', async () => {
    availabilityMocks.dbListRateOverrides.mockResolvedValueOnce([]);
    const app = await caller('super_admin');
    await expect(app.channelManager.listRateOverrides({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
  });

  it('surfaces CONFLICT when an overlapping range is created', async () => {
    availabilityMocks.dbCreateRateOverride.mockRejectedValueOnce(new Error('23P01: overlap'));
    const app = await caller('hotel_owner');
    await expect(app.channelManager.createRateOverride(validCreateInput as any)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('surfaces CONFLICT when the EXCLUDE constraint fires', async () => {
    availabilityMocks.dbCreateRateOverride.mockRejectedValueOnce(new Error('23P01: prevent_rate_override_overlap'));
    const app = await caller('revenue_manager');
    await expect(app.channelManager.createRateOverride(validCreateInput as any)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
