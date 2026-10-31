import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listManagedHotels: vi.fn(), getManagedHotel: vi.fn(), listAvailabilityForHotel: vi.fn(), listBookingOccupancyForHotel: vi.fn(), getOtaSummary: vi.fn() }));
vi.mock('./d1/hotel', () => ({ listManagedHotels: mocks.listManagedHotels, getManagedHotel: mocks.getManagedHotel }));
vi.mock('./d1/availability', () => ({ listAvailabilityForHotel: mocks.listAvailabilityForHotel, listBookingOccupancyForHotel: mocks.listBookingOccupancyForHotel }));
vi.mock('./d1/ota', () => ({ getOtaSummary: mocks.getOtaSummary }));
import { appRouter } from './routers';
describe('dashboard calendar data projection', () => {
  it('uses scoped hotels, availability and checkout-exclusive occupying bookings', async () => {
    const db = {} as any;
    const caller = { userId: 'owner', roles: ['hotel_owner' as const], access: 'authenticated' as const };
    const app = appRouter.createCaller({ req: {} as Request, res: {} as Response, db, caller, user: { id: 'owner', roles: ['hotel_owner'], memberships: [{ hotelId: 'hotel-a', role: 'hotel_owner' }] } as any });
    mocks.listManagedHotels.mockResolvedValue([{ id: 'hotel-a' }]);
    mocks.getManagedHotel.mockResolvedValue({ id: 'hotel-a', name: 'Hotel A', room_types: [{ id: 'type-a', name: 'Standard', base_price: 100 }], rooms: [{ id: 'room-a', room_type_id: 'type-a' }] });
    mocks.listAvailabilityForHotel.mockResolvedValue([{ roomTypeId: 'type-a', date: '2026-11-03', roomsAvailable: 0, price: '150.00' }]);
    mocks.getOtaSummary.mockResolvedValue([]);
    mocks.listBookingOccupancyForHotel.mockResolvedValue([
      { roomId: 'room-a', checkIn: '2026-11-01', checkOut: '2026-11-02', status: 'confirmed' },
      { roomId: 'room-a', checkIn: '2026-11-02', checkOut: '2026-11-04', status: 'cancelled' },
      { roomId: 'room-a', checkIn: '2026-11-02', checkOut: '2026-11-04', status: 'held', expiresAt: '2000-01-01T00:00:00Z' },
    ]);
    const result = await app.channelManager.dashboardCalendar({ startDate: '2026-11-01', days: 7 });
    expect(mocks.listManagedHotels).toHaveBeenCalledWith(db, caller);
    expect(mocks.listAvailabilityForHotel).toHaveBeenCalledWith(db, caller, 'hotel-a');
    expect(mocks.listBookingOccupancyForHotel).toHaveBeenCalledWith(db, caller, 'hotel-a', '2026-11-01', '2026-11-08');
    expect(result.hotels[0].days.slice(0, 3).map(day => ({ date: day.date, bookings: day.bookings, available: day.roomTypes[0].available, price: day.roomTypes[0].price }))).toEqual([
      { date: '2026-11-01', bookings: 1, available: 0, price: 100 },
      { date: '2026-11-02', bookings: 0, available: 1, price: 100 },
      { date: '2026-11-03', bookings: 0, available: 0, price: 150 },
    ]);
  });
});
