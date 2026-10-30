import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 10000 });

const availabilityMocks = vi.hoisted(() => ({
  listAvailabilityForHotel: vi.fn(),
  listBookingOccupancyForHotel: vi.fn(),
  updateAvailability: vi.fn(),
  createRateOverride: vi.fn(),
  listRateOverrides: vi.fn(),
  deleteRateOverride: vi.fn(),
}));

vi.mock('./d1/availability', () => availabilityMocks);

const { appRouter } = await import('./routers');

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_TYPE_ID = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function caller(role: 'hotel_owner' | 'revenue_manager' | 'housekeeping' | 'front_desk') {
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
        id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
        email: `${role}@example.com`,
        name: 'Availability test user',
        accessToken: `${role}-access-token`,
        appMetadata: {},
        userMetadata: {},
        role,
        roles: [role],
        memberships: [{ hotelId: HOME_HOTEL, role }],
      },
      db: {} as any,
      caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
    });
}

beforeEach(() => {
  Object.values(availabilityMocks).forEach(mock => mock.mockReset());
  availabilityMocks.updateAvailability.mockResolvedValue({
    id: 'availability-1',
    roomTypeId: ROOM_TYPE_ID,
    date: '2026-08-20',
    price: '2500.00',
    roomsAvailable: 1,
  });
});

describe.sequential('channelManager availability (D1 router)', () => {

describe('channelManager.updateAvailability (D1 router)', () => {
  it('allows Revenue Manager to update allotment for their hotel', async () => {
    const app = await caller('revenue_manager');

    await expect(
      app.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 1,
        action: 'allotment',
      }),
    ).resolves.toMatchObject({ id: 'availability-1' });

    expect(availabilityMocks.updateAvailability).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['revenue_manager'], access: 'authenticated' },
      {
        hotelId: HOME_HOTEL,
        roomTypeId: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: '2500',
        roomsAvailable: 1,
      },
    );
  });

  it('allows Hotel Owner to issue a stop-sell action', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 0,
        action: 'stop_sell',
      }),
    ).resolves.toMatchObject({ id: 'availability-1' });

    expect(availabilityMocks.updateAvailability).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ roomsAvailable: 0 }),
    );
  });

  it('rejects Housekeeping before any availability write', async () => {
    const app = await caller('housekeeping');

    await expect(
      app.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 0,
        action: 'stop_sell',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
  });

  it('defaults to the rate permission and rejects a user without revenue.manage_rates', async () => {
    const app = await caller('front_desk');

    await expect(
      app.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 5,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
  });

  it('requires hotel_id when the caller only has a global permission', async () => {
    const app = await caller('revenue_manager');

    await expect(
      app.channelManager.updateAvailability({
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 5,
        action: 'rate',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
  });

  it('propagates a NOT_FOUND from the D1 room-type guard', async () => {
    availabilityMocks.updateAvailability.mockRejectedValueOnce(
      new TRPCError({ code: 'NOT_FOUND', message: 'Room type not found.' }),
    );
    const app = await caller('revenue_manager');

    await expect(
      app.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: 'f2a2b2c2-d2e2-42f2-82f2-222222222222',
        date: '2026-08-20',
        price: 2500,
        rooms_available: 1,
        action: 'allotment',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('channelManager.bookingOccupancy (D1 router)', () => {
  it('returns property-scoped occupancy through the D1 helper', async () => {
    const occupancy = [
      {
        roomId: 'room-1',
        checkIn: '2026-10-09',
        checkOut: '2026-10-11',
        status: 'confirmed',
        expiresAt: null,
        source: 'manual',
        guestName: 'Guest',
      },
    ];
    availabilityMocks.listBookingOccupancyForHotel.mockResolvedValueOnce(occupancy);
    const app = await caller('revenue_manager');

    const range = { hotel_id: HOME_HOTEL, check_in: '2026-10-05', check_out: '2026-10-12' };
    await expect(app.channelManager.bookingOccupancy(range)).resolves.toEqual(occupancy);
    expect(availabilityMocks.listBookingOccupancyForHotel).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['revenue_manager'], access: 'authenticated' },
      HOME_HOTEL,
      range.check_in,
      range.check_out,
    );
  });

  it('rejects an out-of-scope hotel before querying occupancy', async () => {
    const app = await caller('revenue_manager');

    await expect(
      app.channelManager.bookingOccupancy({
        hotel_id: 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a',
        check_in: '2026-10-05',
        check_out: '2026-10-12',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(availabilityMocks.listBookingOccupancyForHotel).not.toHaveBeenCalled();
  });
});

});
