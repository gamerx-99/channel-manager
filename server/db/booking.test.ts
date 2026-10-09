import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { listBookingsForHotel } from './booking';

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
    expect(from).toHaveBeenCalledWith('bookings');
  });
});
