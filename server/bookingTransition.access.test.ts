import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ transitionBookingStatus: vi.fn() }));
const supabaseMocks = vi.hoisted(() => ({ createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })) }));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

beforeEach(() => vi.clearAllMocks());

async function caller(role: 'front_desk' | 'revenue_manager') {
  const { appRouter } = await import('./routers');
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900e7-7fe4-45d6-9364-80ea8a035322',
      email: `${role}@example.com`,
      name: 'Booking transition test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId, role }],
    },
  });
}

describe('channelManager.transitionBookingStatus permission boundary', () => {
  it('denies roles without operations.manage_checkin_checkout before calling the RPC layer', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.transitionBookingStatus({
      hotel_id: hotelId,
      booking_id: bookingId,
      to_status: 'checked_in',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(supabaseMocks.createRlsSupabaseClient).not.toHaveBeenCalled();
    expect(dbMocks.transitionBookingStatus).not.toHaveBeenCalled();
  });

  it('allows front desk to request check-in through the request-scoped client', async () => {
    dbMocks.transitionBookingStatus.mockResolvedValueOnce({
      booking_id: bookingId,
      hotel_id: hotelId,
      from_status: 'confirmed',
      to_status: 'checked_in',
    });
    const app = await caller('front_desk');

    await expect(app.channelManager.transitionBookingStatus({
      hotel_id: hotelId,
      booking_id: bookingId,
      to_status: 'checked_in',
    })).resolves.toMatchObject({ to_status: 'checked_in' });

    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('front_desk-access-token');
    expect(dbMocks.transitionBookingStatus).toHaveBeenCalledWith(expect.anything(), {
      hotel_id: hotelId,
      booking_id: bookingId,
      to_status: 'checked_in',
    });
  });
});
