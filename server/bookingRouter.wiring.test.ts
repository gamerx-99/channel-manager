import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression test for a real bug: holdRoomType/confirmBookingDetails were added to
// server/db/booking.ts and server/routers/bookingRouter.ts's own (unused) local
// bookingRouter export, but never imported into server/routers.ts's actual appRouter —
// making them unreachable from the API despite pnpm check/test passing, since nothing
// exercised the live route. This test calls them through the real appRouter so a
// future wiring regression fails loudly instead of silently.

const dbMocks = vi.hoisted(() => ({
  holdRoomType: vi.fn(),
  confirmBookingDetails: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ admin: true })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelManager.holdRoomType / confirmBookingDetails wiring', () => {
  it('is reachable on the real appRouter and reaches the db layer', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({ req: {} as Request, res: {} as Response, user: null });

    dbMocks.holdRoomType.mockResolvedValueOnce({
      booking_id: 'b1',
      hotel_id: 'h1',
      room_id: 'r1',
      expires_at: new Date().toISOString(),
      room_type_name: 'Deluxe',
      room_number: '101',
      total_price: 1000,
      nights: 1,
    });

    await expect(app.channelManager.holdRoomType({
      slug: 'demo-hotel',
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
      check_in: '2026-12-01',
      check_out: '2026-12-02',
    })).resolves.toMatchObject({ booking_id: 'b1' });
    expect(dbMocks.holdRoomType).toHaveBeenCalledTimes(1);

    dbMocks.confirmBookingDetails.mockResolvedValueOnce({
      booking_id: 'b1',
      hotel_id: 'h1',
      status: 'pending_payment',
      expires_at: new Date().toISOString(),
      amount: 1000,
    });

    await expect(app.channelManager.confirmBookingDetails({
      booking_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      guest_name: 'Test Guest',
    })).resolves.toMatchObject({ status: 'pending_payment' });
    expect(dbMocks.confirmBookingDetails).toHaveBeenCalledTimes(1);
  });
});
