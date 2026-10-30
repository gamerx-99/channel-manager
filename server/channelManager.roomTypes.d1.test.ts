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
      name: 'Room type test user',
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

function validPricing(capacity = 2) {
  return {
    base_occupancy: capacity,
    max_occupancy: capacity,
    occupancy_pricing: defaultOccupancyPricing(capacity, capacity),
    child_rates: defaultChildRateConfig(),
  };
}

beforeEach(() => {
  Object.values(hotelMocks).forEach(mock => mock.mockReset());
  Object.values(siteConfigMocks).forEach(mock => mock.mockReset());
  hotelMocks.getManagedHotel.mockResolvedValue({ room_types: [{ id: ROOM_TYPE_ID, capacity: 2 }] });
  hotelMocks.updateManagedRoomType.mockResolvedValue({ id: ROOM_TYPE_ID, name: 'Suite' });
  hotelMocks.deleteManagedRoomType.mockResolvedValue({ id: ROOM_TYPE_ID });
});

describe.sequential('channelManager room types (D1 router)', () => {

describe('channelManager.updateRoomType (D1 router)', () => {
  it('rejects an out-of-scope hotel before attempting an update', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateRoomType({
        hotel_id: 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a',
        room_type_id: ROOM_TYPE_ID,
        name: 'Deluxe King',
        capacity: 2,
        base_price: 2800,
        ...validPricing(2),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows a hotel owner to update a visible room type through the D1 helper', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
        name: '  Suite  ',
        capacity: 2,
        base_price: 3200,
        ...validPricing(2),
      }),
    ).resolves.toMatchObject({ id: ROOM_TYPE_ID });

    expect(hotelMocks.updateManagedRoomType).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      {
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
        name: 'Suite',
        capacity: 2,
        base_price: 3200,
        base_occupancy: 2,
        max_occupancy: 2,
        occupancy_pricing: validPricing(2).occupancy_pricing,
        child_rule: undefined,
        child_rule_limit: undefined,
        child_rates: validPricing(2).child_rates,
        children_count_toward_max: undefined,
      },
    );
  });

  it('rejects a max_occupancy change without a complete pricing schedule', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
        name: 'Deluxe King',
        capacity: 3,
        max_occupancy: 3,
        base_price: 2800,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  // Spec 14 replaces the retired platform bypass with a hotel-data denial.
  it('denies super admin room-type writes before querying hotel data', async () => {
    const app = await caller('super_admin');
    await expect(app.channelManager.updateRoomType({ hotel_id: HOTEL_ID, room_type_id: ROOM_TYPE_ID,
      name: 'Executive King', capacity: 2, base_price: 4000, ...validPricing(2),
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(hotelMocks.getManagedHotel).not.toHaveBeenCalled();
    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  it('rejects a non-positive base price before querying the D1 helper', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
        name: 'Deluxe King',
        capacity: 2,
        base_price: 0,
        ...validPricing(2),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  it('maps a filtered update result to not found', async () => {
    hotelMocks.updateManagedRoomType.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
        name: 'Deluxe King',
        capacity: 2,
        base_price: 2800,
        ...validPricing(2),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('channelManager.deleteRoomType (D1 router)', () => {
  it('rejects an out-of-scope hotel before attempting deletion', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.deleteRoomType({
        hotel_id: 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a',
        room_type_id: ROOM_TYPE_ID,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(hotelMocks.deleteManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows a hotel owner to delete a visible room type through the D1 helper', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.deleteRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
      }),
    ).resolves.toEqual({ success: true, id: ROOM_TYPE_ID });

    expect(hotelMocks.deleteManagedRoomType).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      { hotel_id: HOTEL_ID, room_type_id: ROOM_TYPE_ID },
    );
  });

  it('maps a filtered delete result to not found', async () => {
    hotelMocks.deleteManagedRoomType.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.deleteRoomType({
        hotel_id: HOTEL_ID,
        room_type_id: ROOM_TYPE_ID,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

});


describe('capacity-only updates', () => {
  it('rejects a capacity change without a complete pricing schedule', async () => {
    hotelMocks.getManagedHotel.mockResolvedValueOnce({ room_types: [{ id: ROOM_TYPE_ID, capacity: 2 }] });
    const app = caller('hotel_owner');
    await expect(app.channelManager.updateRoomType({ hotel_id: HOTEL_ID, room_type_id: ROOM_TYPE_ID,
      name: 'Deluxe King', capacity: 3, base_price: 2800 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });
});


describe('missing room type boundary', () => {
  it('rejects a missing same-hotel room type before attempting an update', async () => {
    hotelMocks.getManagedHotel.mockResolvedValueOnce({ room_types: [] });
    const app = caller('hotel_owner');
    await expect(app.channelManager.updateRoomType({ hotel_id: HOTEL_ID, room_type_id: ROOM_TYPE_ID, name: 'Deluxe', capacity: 2, base_price: 2500, ...validPricing() }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(hotelMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });
});
