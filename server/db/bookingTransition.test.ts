import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { transitionBookingStatus } from './booking';

describe('transitionBookingStatus', () => {
  it('calls the atomic lifecycle RPC and returns its transition record', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ booking_id: 'booking-1', hotel_id: 'hotel-1', from_status: 'confirmed', to_status: 'checked_in' }],
      error: null,
    });

    await expect(transitionBookingStatus({ rpc } as unknown as SupabaseClient, {
      booking_id: 'booking-1',
      hotel_id: 'hotel-1',
      to_status: 'checked_in',
    })).resolves.toEqual({
      booking_id: 'booking-1',
      hotel_id: 'hotel-1',
      from_status: 'confirmed',
      to_status: 'checked_in',
    });

    expect(rpc).toHaveBeenCalledWith('transition_booking_status', {
      target_booking_id: 'booking-1',
      target_hotel_id: 'hotel-1',
      target_status: 'checked_in',
    });
  });

  it('maps invalid lifecycle transitions to a safe precondition error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'Booking must be confirmed before check-in.' },
    });

    await expect(transitionBookingStatus({ rpc } as unknown as SupabaseClient, {
      booking_id: 'booking-1',
      hotel_id: 'hotel-1',
      to_status: 'checked_out',
    })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
