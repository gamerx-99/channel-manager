import { hotelUsers } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookingServiceMocks = vi.hoisted(() => ({
  transitionBookingStatus: vi.fn(),
}));

vi.mock('./d1/bookingService', () => bookingServiceMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function makeDb(role: string) {
  const membership = { hotelId, role, permissionGrants: null, permissionRevokes: null, userId: 'd93900e7-7fe4-45d6-9364-80ea8a035322' };
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) {
          return { where: async () => [membership] };
        }
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

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
    db: makeDb(role) as any,
    caller: { userId: 'd93900e7-7fe4-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId, role }], access: 'authenticated' } as any,
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

    expect(bookingServiceMocks.transitionBookingStatus).not.toHaveBeenCalled();
  });

  it('allows front desk to request check-in through the request-scoped client', async () => {
    bookingServiceMocks.transitionBookingStatus.mockResolvedValueOnce({
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

    expect(bookingServiceMocks.transitionBookingStatus).toHaveBeenCalled();
  });
});

