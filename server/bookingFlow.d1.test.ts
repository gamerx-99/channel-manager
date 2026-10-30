import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookingMocks = vi.hoisted(() => ({
  createBookingWithGuests: vi.fn(),
}));
const availabilityMocks = vi.hoisted(() => ({
  assertBookingMinStay: vi.fn(),
}));
const hotelMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
}));

vi.mock('./d1/booking', () => bookingMocks);
vi.mock('./d1/availability', () => availabilityMocks);
vi.mock('./d1/hotel', () => hotelMocks);

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_TYPE_ID = '33333333-3333-4333-8333-333333333333';

async function hotelOwnerCaller() {
  const { appRouter } = await import('./routers');
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'owner@example.com',
      name: 'Owner',
      accessToken: 'hotel_owner-token',
      appMetadata: {},
      userMetadata: {},
      role: 'hotel_owner' as const,
      roles: ['hotel_owner' as const],
      memberships: [{ hotelId: HOTEL_ID, role: 'hotel_owner' as const }],
    },
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            const result = Promise.resolve([{ roomTypeId: ROOM_TYPE_ID }]);
            (result as any).limit = () => result;
            return result;
          },
        }),
      }),
    } as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' } as any,
  });
}

describe('createBooking flow (D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates service totals and grand total correctly before passing to the repository', async () => {
    availabilityMocks.assertBookingMinStay.mockResolvedValue(undefined);
    hotelMocks.getManagedHotel.mockResolvedValue({
      id: HOTEL_ID,
      rooms: [{ id: ROOM_ID, room_type_id: ROOM_TYPE_ID }],
      room_types: [{ id: ROOM_TYPE_ID, base_price: '1000.00' }],
    });
    bookingMocks.createBookingWithGuests.mockResolvedValue({ id: 'new-booking-id' });

    const app = await hotelOwnerCaller();

    const input = {
      hotel_id: HOTEL_ID,
      room_id: ROOM_ID,
      guest_name: 'Test Guest',
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      price: 0,
      source: 'manual' as const,
      status: 'confirmed' as const,
      guests: [],
      services: [
        {
          service_name: 'Breakfast',
          pricing_model: 'PER_PERSON_PER_NIGHT' as const,
          unit_price: 150,
          quantity: 2,
        },
        {
          service_name: 'Airport Transfer',
          pricing_model: 'ONE_TIME' as const,
          unit_price: 800,
          quantity: 1,
        },
      ],
    };

    await app.channelManager.createBooking(input);

    expect(bookingMocks.createBookingWithGuests).toHaveBeenCalledTimes(1);
    const [, , bookingPayload, guestsPayload, servicesPayload] = bookingMocks.createBookingWithGuests.mock.calls[0]!;

    expect(bookingPayload).toMatchObject({
      hotel_id: HOTEL_ID,
      room_id: ROOM_ID,
      guest_name: 'Test Guest',
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      price: 4700,
      source: 'manual',
      status: 'confirmed',
      created_by: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
    });

    expect(guestsPayload).toEqual([]);

    expect(servicesPayload).toHaveLength(2);
    expect(servicesPayload).toEqual([
      {
        service_name: 'Breakfast',
        pricing_model: 'PER_PERSON_PER_NIGHT',
        unit_price: 150,
        quantity: 2,
        total_price: 900,
      },
      {
        service_name: 'Airport Transfer',
        pricing_model: 'ONE_TIME',
        unit_price: 800,
        quantity: 1,
        total_price: 800,
      },
    ]);
  });
});
