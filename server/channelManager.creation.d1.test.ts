import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultChildRateConfig, defaultOccupancyPricing } from '@shared/occupancyPricing';

vi.setConfig({ testTimeout: 10000 });

const hotelMocks = vi.hoisted(() => ({
  listManagedHotels: vi.fn(),
  getManagedHotel: vi.fn(),
  createManagedHotel: vi.fn(),
  createManagedRoomType: vi.fn(),
  updateManagedRoomType: vi.fn(),
  deleteManagedRoomType: vi.fn(),
  createHotelService: vi.fn(),
  updateHotelService: vi.fn(),
  deleteHotelService: vi.fn(),
  listHotelServices: vi.fn(),
  listActiveHotelServicesBySlug: vi.fn(),
  getPublicHotel: vi.fn(),
}));

const siteConfigMocks = vi.hoisted(() => ({
  getHotelSiteConfig: vi.fn(),
  getHotelSiteConfigBySlug: vi.fn(),
  saveHotelSiteConfig: vi.fn(),
  listHotelMedia: vi.fn(),
  createHotelMedia: vi.fn(),
  deleteHotelMedia: vi.fn(),
  setHotelMediaHero: vi.fn(),
}));

vi.mock('./d1/hotel', () => hotelMocks);
vi.mock('./d1/siteConfig', () => siteConfigMocks);

const { appRouter } = await import('./routers');

const HOTEL_ID = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_TYPE_ID = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function caller(role: 'super_admin' | 'hotel_owner' | 'front_desk', hotelId = HOTEL_ID) {
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: `${role}@example.com`,
      name: 'Creation test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: role === 'hotel_owner' ? [{ hotelId, role }] : [],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  });
}

beforeEach(() => {
  Object.values(hotelMocks).forEach(mock => mock.mockReset());
  Object.values(siteConfigMocks).forEach(mock => mock.mockReset());
  hotelMocks.createManagedHotel.mockResolvedValue({ id: 'hotel-created' });
  hotelMocks.createManagedRoomType.mockResolvedValue({ id: ROOM_TYPE_ID, hotelId: HOTEL_ID });
});

describe.sequential('channelManager creation (D1 router)', () => {

describe('channelManager.createHotel (D1 router)', () => {
  it('rejects hotel creation for a non-super-admin before INSERT is attempted', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createHotel({
        name: 'Little Bro',
        slug: 'little-bro',
        address: 'Bangkok',
        owner_contact: 'owner@example.com',
        public_enabled: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(hotelMocks.createManagedHotel).not.toHaveBeenCalled();
  });

  it('passes normalized, validated input to the D1 insert helper for a super-admin', async () => {
    const app = await caller('super_admin');

    await expect(
      app.channelManager.createHotel({
        name: '  Little Bro  ',
        slug: 'Little-Bro',
        address: '  Bangkok  ',
        owner_contact: ' owner@example.com ',
        public_enabled: true,
      }),
    ).resolves.toEqual({ id: 'hotel-created' });

    expect(hotelMocks.createManagedHotel).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['super_admin'], access: 'authenticated' },
      {
        name: 'Little Bro',
        slug: 'little-bro',
        address: 'Bangkok',
        owner_contact: 'owner@example.com',
        public_enabled: true,
      },
    );
  });

  it('rejects an invalid public slug during tRPC input validation', async () => {
    const app = await caller('super_admin');

    await expect(
      app.channelManager.createHotel({
        name: 'Little Bro',
        slug: 'Little Bro',
        address: 'Bangkok',
        owner_contact: 'owner@example.com',
        public_enabled: false,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(hotelMocks.createManagedHotel).not.toHaveBeenCalled();
  });
});

describe('channelManager.createRoomType (D1 router)', () => {
  it('rejects a hotel outside the caller membership before INSERT', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a',
        name: 'Deluxe King',
        capacity: 2,
        base_price: 2500,
        quantity: 5,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(hotelMocks.createManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows a hotel owner to create a positive-priced room type through the D1 helper', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: HOTEL_ID,
        name: '  Deluxe King  ',
        capacity: 2,
        base_price: 2500,
        quantity: 5,
      }),
    ).resolves.toEqual({ id: ROOM_TYPE_ID, hotelId: HOTEL_ID });

    expect(hotelMocks.createManagedRoomType).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      {
        hotel_id: HOTEL_ID,
        name: 'Deluxe King',
        capacity: 2,
        base_price: 2500,
        quantity: 5,
        base_occupancy: undefined,
        max_occupancy: undefined,
        occupancy_pricing: undefined,
        child_rule: undefined,
        child_rule_limit: undefined,
        child_rates: undefined,
        children_count_toward_max: undefined,
      },
    );
  });

  it('rejects a zero base price before querying the database', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: HOTEL_ID,
        name: 'Deluxe King',
        capacity: 2,
        base_price: 0,
        quantity: 5,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(hotelMocks.createManagedRoomType).not.toHaveBeenCalled();
  });

  it('maps a database uniqueness error to a conflict response', async () => {
    hotelMocks.createManagedRoomType.mockRejectedValueOnce(
      new Error('23505: duplicate key value violates unique constraint'),
    );
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: HOTEL_ID,
        name: 'Duplicate',
        capacity: 2,
        base_price: 2500,
        quantity: 5,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A hotel or room type with the same unique details already exists.',
    });
  });

  it('rejects a height child rule without a limit', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: HOTEL_ID,
        name: 'Height Rule Room',
        capacity: 2,
        base_price: 2500,
        quantity: 1,
        child_rule: 'height',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(hotelMocks.createManagedRoomType).not.toHaveBeenCalled();
  });

  it('accepts a height child rule when the limit is supplied', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.createRoomType({
        hotel_id: HOTEL_ID,
        name: 'Height Rule Room',
        capacity: 2,
        base_price: 2500,
        quantity: 1,
        child_rule: 'height',
        child_rule_limit: 160,
        occupancy_pricing: defaultOccupancyPricing(2, 2),
        child_rates: defaultChildRateConfig(),
      }),
    ).resolves.toEqual({ id: ROOM_TYPE_ID, hotelId: HOTEL_ID });
  });
});

});
