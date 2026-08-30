import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getStayDates, getPublicHotelAvailability, createPublicBooking } from './db';
import { resolveEffectiveRate, calcNights } from './pricing';
import { TRPCError } from '@trpc/server';

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

  describe('createPublicBooking error handling', () => {
    it('rejects invalid stay date ranges with BAD_REQUEST', async () => {
      const mockClient = {} as any;
      await expect(
        createPublicBooking(mockClient, {
          slug: 'test-hotel',
          room_type_id: '11111111-1111-1111-1111-111111111111',
          check_in: '2026-10-05',
          check_out: '2026-10-02',
          guest_name: 'John Doe',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Check-out date must be after check-in date.',
      });
    });

    it('maps Postgres exclusion constraint prevent_double_booking into friendly BAD_REQUEST', async () => {
      const mockClient = {
        rpc: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'hotel-1', name: 'Test Resort', slug: 'test-resort', address: 'Bangkok' },
            error: null,
          }),
        }),
        from: vi.fn((table: string) => {
          if (table === 'room_types') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'rt-1', hotel_id: 'hotel-1', name: 'Deluxe', capacity: 2, base_price: 1500 },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'rate_overrides') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          if (table === 'rooms') {
            return {
              select: vi.fn().mockImplementation((cols: string) => {
                // assertBookingMinStay: .select('room_type_id').eq('id', roomId).maybeSingle()
                if (cols === 'room_type_id') {
                  return {
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { room_type_id: 'rt-1' },
                        error: null,
                      }),
                    }),
                  };
                }
                // createPublicBooking Promise.all: .select('id,...').eq('hotel_id',...).eq('room_type_id',...)
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({
                      data: [{ id: 'room-101', hotel_id: 'hotel-1', room_type_id: 'rt-1', room_number: '101', status: 'available' }],
                      error: null,
                    }),
                  }),
                };
              }),
            };
          }
          if (table === 'bookings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      code: '23P01',
                      message: 'conflicting key value violates exclusion constraint "prevent_double_booking"',
                    },
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }),
      } as any;

      await expect(
        createPublicBooking(mockClient, {
          slug: 'test-resort',
          room_type_id: 'rt-1',
          check_in: '2026-11-01',
          check_out: '2026-11-03',
          guest_name: 'Somchai Prasert',
          guest_phone: '0812345678',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringMatching(/selected room was just booked|no longer available/i),
      });
    });

    it('enforces min_stay_nights for public booking checkout', async () => {
      const mockClient = {
        rpc: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'hotel-1', name: 'Test Resort', slug: 'test-resort', address: 'Phuket' },
            error: null,
          }),
        }),
        from: vi.fn((table: string) => {
          if (table === 'room_types') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'rt-villa', hotel_id: 'hotel-1', name: 'Pool Villa', capacity: 4, base_price: 5000 },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'rate_overrides') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{
                      id: 'ov-ny',
                      room_type_id: 'rt-villa',
                      start_date: '2026-12-30',
                      end_date: '2027-01-02',
                      override_price: 8000,
                      min_stay_nights: 3,
                      created_at: new Date().toISOString(),
                    }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }),
      } as any;

      // 2 nights < 3 required
      await expect(
        createPublicBooking(mockClient, {
          slug: 'test-resort',
          room_type_id: 'rt-villa',
          check_in: '2026-12-31',
          check_out: '2027-01-02',
          guest_name: 'Alice Wonder',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringMatching(/must be at least 3 nights/i),
      });
    });
  });
});
