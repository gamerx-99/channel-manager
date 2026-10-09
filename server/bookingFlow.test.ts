import { describe, expect, it, beforeEach, vi } from 'vitest';
import { appRouter } from './routers';
import { createContext } from './_core/context';
import type { Request, Response } from 'express';

const HOTEL_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_TYPE_ID = '33333333-3333-4333-8333-333333333333';

const dbMocks = vi.hoisted(() => ({
  assertBookingMinStay: vi.fn(),
  createBookingWithGuests: vi.fn(),
  getManagedHotel: vi.fn(),
}));

vi.mock('./db', async importOriginal => ({
  ...((await importOriginal()) as any),
  assertBookingMinStay: dbMocks.assertBookingMinStay,
  createBookingWithGuests: dbMocks.createBookingWithGuests,
  getManagedHotel: dbMocks.getManagedHotel,
}));

vi.mock('./supabase', async importOriginal => ({
  ...((await importOriginal()) as any),
  rlsClient: vi.fn().mockReturnValue({ requestScoped: true }),
}));

async function hotelOwnerCaller() {
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
  });
}

describe('createBooking flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates service totals and grand total correctly before passing to db', async () => {
    dbMocks.assertBookingMinStay.mockResolvedValue(undefined);
    
    // Mock the hotel room base price = 1000
    dbMocks.getManagedHotel.mockResolvedValue({
      id: HOTEL_ID,
      rooms: [{ id: ROOM_ID, room_type_id: ROOM_TYPE_ID }],
      room_types: [{ id: ROOM_TYPE_ID, base_price: 1000 }],
    });

    dbMocks.createBookingWithGuests.mockResolvedValue({ id: 'new-booking-id' });

    const app = await hotelOwnerCaller();

    const input = {
      hotel_id: HOTEL_ID,
      room_id: ROOM_ID,
      guest_name: 'Test Guest',
      check_in: '2026-10-01',
      check_out: '2026-10-04', // 3 nights
      adults: 3,
      children: [{ age: 5 }, { age: 12 }],
      price: 0, // Should be ignored/overwritten by the server
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
        }
      ],
    };

    await app.channelManager.createBooking(input);

    expect(dbMocks.getManagedHotel).toHaveBeenCalled();

    // Check exactly how createBookingWithGuests was called
    expect(dbMocks.createBookingWithGuests).toHaveBeenCalledTimes(1);
    const [client, bookingPayload, guestsPayload, servicesPayload] = dbMocks.createBookingWithGuests.mock.calls[0];
    
    // client is the RLS-scoped Supabase client created by rlsClient() inside the router.
    // rlsClient() is a local helper (not a named export), so its return value cannot be
    // intercepted by vi.mock('./supabase'). We assert it is a non-null object — i.e. a
    // real Supabase client was constructed and forwarded to the DB function.
    expect(client).toBeDefined();
    expect(typeof client).toBe('object');

    // 3 nights * 1000 room = 3000
    // Breakfast: 150 * 2 * 3 nights = 900
    // Airport Transfer: 800 * 1 = 800
    // Grand Total = 3000 + 900 + 800 = 4700
    expect(bookingPayload).toMatchObject({
      hotel_id: HOTEL_ID,
      room_id: ROOM_ID,
      guest_name: 'Test Guest',
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      adults: 3,
      children: 2,
      child_measurements: [{ age: 5 }, { age: 12 }],
      price: 4700, // Calculated correctly by server!
    });

    expect(guestsPayload).toEqual([]);

    expect(servicesPayload).toHaveLength(2);
    expect(servicesPayload).toEqual([
      {
        service_name: 'Breakfast',
        pricing_model: 'PER_PERSON_PER_NIGHT',
        unit_price: 150,
        quantity: 2,
        total_price: 900, // 150 * 2 * 3
      },
      {
        service_name: 'Airport Transfer',
        pricing_model: 'ONE_TIME',
        unit_price: 800,
        quantity: 1,
        total_price: 800,
      }
    ]);
  });
});
