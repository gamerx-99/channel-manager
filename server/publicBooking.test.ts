import { describe, expect, it, vi } from 'vitest';
import { getStayDates, getPublicHotelAvailability } from './db';
import { resolveEffectiveRate } from './pricing';

describe('Public Booking Engine & Availability Logic', () => {
  describe('getStayDates', () => {
    it('returns an array of ISO date strings for each night of stay', () => {
      expect(getStayDates('2026-10-01', '2026-10-04')).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
      ]);
    });

    it('returns empty array when check_out is equal to or before check_in', () => {
      expect(getStayDates('2026-10-05', '2026-10-05')).toEqual([]);
      expect(getStayDates('2026-10-05', '2026-10-01')).toEqual([]);
    });

    it('handles single night stay correctly', () => {
      expect(getStayDates('2026-12-31', '2027-01-01')).toEqual(['2026-12-31']);
    });
  });

  describe('Dynamic Price Calculation with Overrides', () => {
    it('sums effective rates across stay dates using narrowest matching override', () => {
      const roomType = { id: 'rt-1', base_price: 1000 };
      const overrides = [
        {
          id: 'ov-1',
          room_type_id: 'rt-1',
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          override_price: 1500,
          min_stay_nights: null,
        },
        {
          id: 'ov-special',
          room_type_id: 'rt-1',
          start_date: '2026-11-15',
          end_date: '2026-11-16',
          override_price: 2200,
          min_stay_nights: null,
        },
      ];

      const stayDates = getStayDates('2026-11-14', '2026-11-17'); // Nov 14, Nov 15, Nov 16
      const totalPrice = stayDates.reduce(
        (sum, date) => sum + resolveEffectiveRate(roomType, date, overrides),
        0,
      );

      // Nov 14: 1500, Nov 15: 2200 (narrower), Nov 16: 2200 (narrower) -> 1500 + 2200 + 2200 = 5900
      expect(totalPrice).toBe(5900);
    });
  });

  describe('public availability inventory boundary', () => {
    it('uses the published-hotel inventory RPC and returns only room-type availability counts', async () => {
      const hotel = { id: 'hotel-1', name: 'Test Resort', slug: 'test-resort', address: 'Phuket' };
      const roomTypes = [
        { id: 'rt-1', hotel_id: 'hotel-1', name: 'Deluxe', capacity: 2, base_price: 1500, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { '1': { enabled: false, mode: 'percent', value: 0 }, '2': { enabled: true, mode: 'percent', value: 0 } }, child_rule: 'age', child_rule_limit: null, child_rates: { infant: { mode: 'free', value: 0 }, age_groups: [], height: { mode: 'free', value: 0 } }, children_count_toward_max: true },
        { id: 'rt-2', hotel_id: 'hotel-1', name: 'Standard', capacity: 2, base_price: 1000, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { '1': { enabled: false, mode: 'percent', value: 0 }, '2': { enabled: true, mode: 'percent', value: 0 } }, child_rule: 'age', child_rule_limit: null, child_rates: { infant: { mode: 'free', value: 0 }, age_groups: [], height: { mode: 'free', value: 0 } }, children_count_toward_max: true },
      ];
      const rpc = vi.fn((name: string) => name === 'get_public_hotel'
        ? { single: vi.fn().mockResolvedValue({ data: hotel, error: null }) }
        : Promise.resolve({
          data: [
          { room_type_id: 'rt-1', rooms_available: 1 },
          ],
          error: null,
        }));
      const from = vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: table === 'room_types' ? roomTypes : [],
              error: null,
            }),
          }),
        }),
      }));

      const result = await getPublicHotelAvailability({ rpc, from } as any, 'test-resort', '2026-10-20', '2026-10-22');

      expect(rpc).toHaveBeenCalledWith('get_public_room_type_availability_for_guests', {
        target_hotel_id: 'hotel-1',
        target_check_in: '2026-10-20',
        target_check_out: '2026-10-22',
        target_adults: 2,
        target_children: [],
      });
      expect(from).toHaveBeenCalledTimes(2);
      expect(from).not.toHaveBeenCalledWith('rooms');
      expect(from).not.toHaveBeenCalledWith('bookings');
      expect(result.room_types.map(roomType => [roomType.id, roomType.rooms_available, roomType.is_available, roomType.nightly_prices])).toEqual([
        ['rt-1', 1, true, [1500, 1500]],
      ]);
    });
  });

});
