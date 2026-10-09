import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createBookingWithGuests, listBookingsForHotel } from './booking';

describe('listBookingsForHotel relation mapping', () => {
  it.each([
    {
      rooms: { room_number: '101', room_types: { name: 'Deluxe' } },
      expectedRoom: { room_number: '101', room_types: { name: 'Deluxe' } },
    },
    {
      rooms: [{ room_number: '102', room_types: [{ name: 'Suite' }] }],
      expectedRoom: { room_number: '102', room_types: { name: 'Suite' } },
    },
  ])('normalizes object and array Supabase relation shapes', async ({ rooms, expectedRoom }) => {
    const rows = [{
      id: 'booking-1',
      hotel_id: 'hotel-1',
      room_id: 'room-1',
      guest_name: 'Guest Example',
      check_in: '2026-10-09',
      check_out: '2026-10-10',
      adults: 2,
      children: 1,
      child_measurements: [{ age: 6 }],
      price: 1000,
      source: 'manual',
      status: 'confirmed',
      created_at: '2026-10-01T00:00:00Z',
      rooms,
      guests: [],
    }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const bookings = await listBookingsForHotel({ from } as unknown as SupabaseClient, 'hotel-1');

    expect(bookings[0].rooms).toEqual(expectedRoom);
    expect(bookings[0]).toMatchObject({ adults: 2, children: 1, child_measurements: [{ age: 6 }] });
    expect(select).toHaveBeenCalledWith(expect.stringContaining('adults,children,child_measurements'));
    expect(from).toHaveBeenCalledWith('bookings');
  });
});

describe('createBookingWithGuests occupancy persistence', () => {
  it('writes adult count, child count, and each property-rule measurement to bookings', async () => {
    const insertPayload = vi.fn();
    const single = vi.fn().mockResolvedValue({
      data: { id: 'booking-1' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn((payload: unknown) => {
      insertPayload(payload);
      return { select };
    });
    const from = vi.fn((table: string) => {
      if (table !== 'bookings') throw new Error(`Unexpected table: ${table}`);
      return { insert };
    });

    await createBookingWithGuests(
      { from } as unknown as SupabaseClient,
      {
        hotel_id: 'hotel-1',
        room_id: null,
        guest_name: 'Guest Example',
        check_in: '2026-10-10',
        check_out: '2026-10-12',
        adults: 2,
        children: 2,
        child_measurements: [{ age: 4 }, { age: 9 }],
        price: 2000,
        source: 'manual',
        status: 'confirmed',
      },
      [],
    );

    expect(insertPayload).toHaveBeenCalledWith(expect.objectContaining({
      adults: 2,
      children: 2,
      child_measurements: [{ age: 4 }, { age: 9 }],
    }));
  });
});
