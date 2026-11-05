// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import BookingStepRooms, { AMENITY_ICONS } from './BookingStepRooms';
import { ROOM_AMENITY_KEYS } from '@shared/roomAmenities';
import th from '@/lib/i18n/th';

afterEach(() => {
  cleanup();
});

const publicHotelQuery = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trpc', () => ({
  trpc: {
    channelManager: {
      publicHotel: {
        useQuery: publicHotelQuery,
      },
    },
  },
}));

function testT(key: string, params?: Record<string, unknown>): string {
  if (key === 'publicHotel.roomBedDetail') return `Bed: ${params?.value}`;
  if (key === 'publicHotel.roomSizeDetail') return `${params?.value} m²`;
  if (key.startsWith('roomAmenities.items.')) {
    const itemKey = key.replace('roomAmenities.items.', '');
    return (th.roomAmenities.items as Record<string, string>)[itemKey] ?? itemKey;
  }
  if (key === 'roomAmenities.moreItems') {
    return th.roomAmenities.moreItems.replace('{{count}}', String(params?.count ?? ''));
  }
  return key;
}

function renderMarkup(roomDetails?: Record<string, unknown>) {
  publicHotelQuery.mockReturnValue({
    data: {
      roomTypes: [{ id: 'room-a', ...roomDetails }],
    },
  });
  return renderToStaticMarkup(
    <BookingStepRooms
      t={testT as any}
      availabilityQuery={{ isLoading: false, data: { hotel: { slug: 'hotel-a' } } } as any}
      availableRoomTypes={[
        {
          id: 'room-a',
          name: 'Suite',
          capacity: 2,
          rooms_available: 1,
          total_price: '2000',
          avg_nightly_price: '2000',
          nights: 1,
          is_available: true,
        },
      ] as any}
      preferredRoomTypeId={null}
      handleHoldRoom={vi.fn()}
      holdRoomTypeMutation={{ isPending: false } as any}
      setWizardStep={vi.fn()}
    />
  );
}

function renderComponent(options?: {
  roomDetails?: Record<string, unknown>;
  handleHoldRoom?: (id: string) => void;
  availableRoomTypes?: any[];
  allRoomDetails?: Record<string, unknown>[];
}) {
  const handleHoldRoom = options?.handleHoldRoom ?? vi.fn();
  const roomTypesData = options?.allRoomDetails
    ? options.allRoomDetails
    : [{ id: 'room-a', ...options?.roomDetails }];

  publicHotelQuery.mockReturnValue({
    data: {
      roomTypes: roomTypesData,
    },
  });

  const availableRoomTypes = options?.availableRoomTypes ?? [
    {
      id: 'room-a',
      name: 'Suite',
      capacity: 2,
      rooms_available: 1,
      total_price: '2000',
      avg_nightly_price: '2000',
      nights: 1,
      is_available: true,
    },
  ];

  const result = render(
    <BookingStepRooms
      t={testT as any}
      availabilityQuery={{ isLoading: false, data: { hotel: { slug: 'hotel-a' } } } as any}
      availableRoomTypes={availableRoomTypes}
      preferredRoomTypeId={null}
      handleHoldRoom={handleHoldRoom}
      holdRoomTypeMutation={{ isPending: false } as any}
      setWizardStep={vi.fn()}
    />
  );

  return { ...result, handleHoldRoom };
}

describe('BookingStepRooms details', () => {
  it('shows hotel supplied room details before selection with canonical amenities and icons', () => {
    const { container } = renderComponent({
      roomDetails: {
        description: 'Quiet corner room',
        bed_type: 'King',
        size_sqm: 32,
        amenities: ['free_wifi', 'desk'],
      },
    });

    expect(screen.getByText('Quiet corner room')).toBeDefined();
    expect(screen.getByText('Bed: King')).toBeDefined();
    expect(screen.getByText('32 m²')).toBeDefined();
    expect(screen.getByText(th.roomAmenities.items.free_wifi)).toBeDefined();
    expect(screen.getByText(th.roomAmenities.items.desk)).toBeDefined();

    // Verify icons are rendered with text next to them
    const items = container.querySelectorAll('.booking-room-amenity-item');
    expect(items).toHaveLength(2);
    items.forEach(item => {
      const svg = item.querySelector('svg');
      const text = item.querySelector('span');
      expect(svg).not.toBeNull();
      expect(text).not.toBeNull();
      expect(text?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it('renders an old room with no details without empty labels or amenities list', () => {
    const html = renderMarkup();
    expect(html).toContain('Suite');
    expect(html).not.toContain('Bed:');
    expect(html).not.toContain('m²');
    expect(html).not.toContain('<li>');
    expect(html).not.toContain('booking-room-amenities');
    expect(html).not.toContain('booking-amenities-expander');
  });

  it('renders room with 0 amenities: does not render amenities list or expander', () => {
    const { container } = renderComponent({
      roomDetails: { amenities: [] },
    });

    expect(screen.getByText('Suite')).toBeDefined();
    expect(container.querySelector('li')).toBeNull();
    expect(container.querySelector('.booking-room-amenities')).toBeNull();
    expect(container.querySelector('.booking-amenities-expander')).toBeNull();
    expect(screen.queryByRole('button', { name: /\+.*รายการ/ })).toBeNull();
  });

  it('displays exactly 6 items: shows all 6 items with icons and text, no expander button', () => {
    const sixKeys = ROOM_AMENITY_KEYS.slice(0, 6);
    const { container } = renderComponent({
      roomDetails: { amenities: sixKeys },
    });

    // Verify all 6 items are visible
    for (const key of sixKeys) {
      const label = (th.roomAmenities.items as Record<string, string>)[key];
      expect(screen.getByText(label)).toBeDefined();
    }

    const items = container.querySelectorAll('.booking-room-amenity-item');
    expect(items).toHaveLength(6);
    items.forEach(item => {
      expect(item.querySelector('svg')).not.toBeNull();
      expect(item.querySelector('span')).not.toBeNull();
    });

    // Expander button is not rendered
    expect(container.querySelector('.booking-amenities-expander')).toBeNull();
    expect(screen.queryByRole('button', { name: /\+.*รายการ/ })).toBeNull();
  });

  it('displays > 6 items (e.g. 8 items): shows first 6 items + "+2 รายการ" button; clicking expands to show all 8', () => {
    const eightKeys = ROOM_AMENITY_KEYS.slice(0, 8);
    const firstSix = eightKeys.slice(0, 6);
    const remainingTwo = eightKeys.slice(6, 8);

    const { container } = renderComponent({
      roomDetails: { amenities: eightKeys },
    });

    // Before expansion: first 6 items are visible
    for (const key of firstSix) {
      const label = (th.roomAmenities.items as Record<string, string>)[key];
      expect(screen.getByText(label)).toBeDefined();
    }

    // Remaining 2 items are not in the DOM initially
    for (const key of remainingTwo) {
      const label = (th.roomAmenities.items as Record<string, string>)[key];
      expect(screen.queryByText(label)).toBeNull();
    }

    // Expander button "+2 รายการ" is visible
    const expander = screen.getByRole('button', { name: '+2 รายการ' });
    expect(expander).toBeDefined();

    // Click the expander button
    fireEvent.click(expander);

    // After expansion: all 8 items are visible
    for (const key of eightKeys) {
      const label = (th.roomAmenities.items as Record<string, string>)[key];
      expect(screen.getByText(label)).toBeDefined();
    }

    const allItems = container.querySelectorAll('.booking-room-amenity-item');
    expect(allItems).toHaveLength(8);

    // Expander button is no longer visible
    expect(screen.queryByRole('button', { name: '+2 รายการ' })).toBeNull();
  });

  it('verifies stopPropagation on expander click so handleHoldRoom is not triggered', () => {
    const handleHoldRoom = vi.fn();
    const eightKeys = ROOM_AMENITY_KEYS.slice(0, 8);

    const { container } = renderComponent({
      roomDetails: { amenities: eightKeys },
      handleHoldRoom,
    });

    const expander = screen.getByRole('button', { name: '+2 รายการ' });
    expect(expander).toBeDefined();

    // Click the expander button
    fireEvent.click(expander);

    // handleHoldRoom should NOT have been called due to e.stopPropagation()
    expect(handleHoldRoom).not.toHaveBeenCalled();

    // Now click the room card itself
    const card = container.querySelector('.booking-room-card')!;
    expect(card).not.toBeNull();
    fireEvent.click(card);

    // Room hold should now be triggered
    expect(handleHoldRoom).toHaveBeenCalledTimes(1);
    expect(handleHoldRoom).toHaveBeenCalledWith('room-a');
  });

  it('maps all 30 canonical RoomAmenityKeys to valid Lucide React icons', () => {
    expect(ROOM_AMENITY_KEYS).toHaveLength(30);
    for (const key of ROOM_AMENITY_KEYS) {
      const IconComponent = AMENITY_ICONS[key];
      expect(IconComponent).toBeDefined();
      expect(typeof IconComponent).toBe('object');
    }
  });

  it('renders amenities in canonical order even if provided in shuffled order', () => {
    const shuffled = ['desk', 'air_conditioning', 'private_bathroom', 'free_wifi'];
    const { container } = renderComponent({
      roomDetails: { amenities: shuffled },
    });

    const items = Array.from(container.querySelectorAll('.booking-room-amenity-item span')).map(
      el => el.textContent,
    );
    // Canonical order in ROOM_AMENITY_KEYS: air_conditioning, free_wifi, private_bathroom, desk
    expect(items).toEqual([
      th.roomAmenities.items.air_conditioning,
      th.roomAmenities.items.free_wifi,
      th.roomAmenities.items.private_bathroom,
      th.roomAmenities.items.desk,
    ]);
  });

  it('expands amenities independently per room card when multiple rooms exist', () => {
    const eightKeys = ROOM_AMENITY_KEYS.slice(0, 8);
    const sevenKeys = ROOM_AMENITY_KEYS.slice(1, 8);

    renderComponent({
      availableRoomTypes: [
        {
          id: 'room-1',
          name: 'Deluxe Room',
          capacity: 2,
          rooms_available: 1,
          total_price: '1500',
          avg_nightly_price: '1500',
          nights: 1,
          is_available: true,
        },
        {
          id: 'room-2',
          name: 'Grand Suite',
          capacity: 4,
          rooms_available: 1,
          total_price: '3000',
          avg_nightly_price: '3000',
          nights: 1,
          is_available: true,
        },
      ],
      allRoomDetails: [
        { id: 'room-1', amenities: eightKeys },
        { id: 'room-2', amenities: sevenKeys },
      ],
    });

    // Both expander buttons exist
    const expanders = screen.getAllByRole('button', { name: /\+.*รายการ/ });
    expect(expanders).toHaveLength(2);
    expect(screen.getByRole('button', { name: '+2 รายการ' })).toBeDefined();
    expect(screen.getByRole('button', { name: '+1 รายการ' })).toBeDefined();

    // Click expander on room-1 only
    fireEvent.click(screen.getByRole('button', { name: '+2 รายการ' }));

    // room-1 expander is gone, room-2 expander still remains
    expect(screen.queryByRole('button', { name: '+2 รายการ' })).toBeNull();
    expect(screen.getByRole('button', { name: '+1 รายการ' })).toBeDefined();
  });
});
