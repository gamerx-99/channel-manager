import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getLatestPaymentSession: vi.fn(),
  getHotelPaymentConfig: vi.fn(),
  expireBookingIfPast: vi.fn(),
  finalizePaymentSession: vi.fn(),
  logBookingStatusChange: vi.fn(),
  updateBookingPaymentStatus: vi.fn(),
  updatePaymentSessionStatus: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const sessionHotelId = '11111111-1111-4111-8111-111111111111';
const otherHotelId = '22222222-2222-4222-8222-222222222222';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getLatestPaymentSession.mockResolvedValue({
    id: sessionId,
    booking_id: bookingId,
    hotel_id: sessionHotelId,
    amount: 100,
    status: 'pending',
    qr_reference: 'BK-123',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  supabaseMocks.createSupabaseAdminClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: bookingId, status: 'pending_payment' }, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {};
    },
  });
});

describe('verifySlip hotel scoping', () => {
  it('rejects a hotel_id that differs from the session hotel', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({ req: {} as any, res: {} as any, user: null });
    await expect(app.payment.verifySlip({
      booking_id: bookingId,
      hotel_id: otherHotelId,
      session_id: sessionId,
      slip_data: 'AAAA',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(dbMocks.getHotelPaymentConfig).not.toHaveBeenCalled();
  });

  it('loads payment config using the session hotel_id', async () => {
    dbMocks.expireBookingIfPast.mockResolvedValue({ status: 'pending_payment' });
    dbMocks.getHotelPaymentConfig.mockResolvedValue(null);
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({ req: {} as any, res: {} as any, user: null });
    await expect(app.payment.verifySlip({
      booking_id: bookingId,
      session_id: sessionId,
      slip_data: 'AAAA',
    })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(dbMocks.getHotelPaymentConfig).toHaveBeenCalledWith(expect.anything(), sessionHotelId);
  });
});