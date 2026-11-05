import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BookingStepRooms from './BookingStepRooms';

const publicHotelQuery = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trpc', () => ({ trpc: { channelManager: { publicHotel: { useQuery: publicHotelQuery } } } }));

function render(roomDetails?: Record<string, unknown>) {
  publicHotelQuery.mockReturnValue({ data: { roomTypes: [{ id: 'room-a', ...roomDetails }] } });
  return renderToStaticMarkup(<BookingStepRooms {...({
    t: (key: string, params?: Record<string, unknown>) => key === 'publicHotel.roomBedDetail' ? `Bed: ${params?.value}` : key === 'publicHotel.roomSizeDetail' ? `${params?.value} m²` : key,
    availabilityQuery: { isLoading: false, data: { hotel: { slug: 'hotel-a' } } },
    availableRoomTypes: [{ id: 'room-a', name: 'Suite', capacity: 2, rooms_available: 1, total_price: 2000, avg_nightly_price: 2000, nights: 1, is_available: true }],
    preferredRoomTypeId: null, handleHoldRoom: vi.fn(), holdRoomTypeMutation: { isPending: false }, setWizardStep: vi.fn(),
  } as any)} />);
}

describe('BookingStepRooms details', () => {
  it('shows hotel supplied room details before selection', () => {
    const html = render({ description: 'Quiet corner room', bed_type: 'King', size_sqm: 32, amenities: ['Wi-Fi', 'Desk'] });
    expect(html).toContain('Quiet corner room');
    expect(html).toContain('Bed: King');
    expect(html).toContain('32 m²');
    expect(html).toContain('<li>Wi-Fi</li>');
  });

  it('renders an old room with no details without empty labels', () => {
    const html = render();
    expect(html).toContain('Suite');
    expect(html).not.toContain('Bed:');
    expect(html).not.toContain('m²');
    expect(html).not.toContain('<li>');
  });
});
