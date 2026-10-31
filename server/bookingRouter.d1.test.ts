import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ holdRoomType: vi.fn(), confirmBookingDetails: vi.fn() }));
vi.mock('./d1/booking', () => mocks);
import { appRouter } from './routers';
beforeEach(() => vi.resetAllMocks());
describe('public booking router wiring', () => {
  it('reaches holdRoomType and confirmBookingDetails through the real appRouter', async () => {
    const db = {} as any;
    const publicCaller = { userId: '', roles: [], access: 'public' as const };
    const app = appRouter.createCaller({ req: {} as Request, res: {} as Response, user: null, db, caller: publicCaller });
    const roomTypeId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';
    const bookingId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
    const hotelId = '11111111-1111-4111-8111-111111111111';
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: bookingId });
    await expect(app.channelManager.holdRoomType({ slug: 'demo-hotel', room_type_id: roomTypeId, check_in: '2026-12-01', check_out: '2026-12-02', adults: 2, children: [] })).resolves.toEqual({ booking_id: bookingId });
    expect(mocks.holdRoomType).toHaveBeenCalledWith(db, publicCaller, expect.objectContaining({ slug: 'demo-hotel', room_type_id: roomTypeId }));
    mocks.confirmBookingDetails.mockResolvedValueOnce({ status: 'pending_payment' });
    await expect(app.channelManager.confirmBookingDetails({ booking_id: bookingId, hotel_id: hotelId, guest_name: 'Test Guest' })).resolves.toEqual({ status: 'pending_payment' });
    expect(mocks.confirmBookingDetails).toHaveBeenCalledWith(db, publicCaller, expect.objectContaining({ booking_id: bookingId, hotel_id: hotelId, guest_name: 'Test Guest' }));
  });
});
