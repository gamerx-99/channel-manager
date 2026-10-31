import { bookings, hotelUsers, bookingStatusLog } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function makeDb(status: string | null) {
  const membership = { hotelId, role: 'hotel_owner', permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  const booking = status ? { id: bookingId, hotelId, status } : null;
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) {
          return { where: async () => [membership] };
        }
        return {
          where: () => ({
            limit: async () => (booking ? [booking] : []),
          }),
        };
      },
    }),
    update: (_table: any) => ({
      set: (_patch: any) => ({
        where: () => ({
          returning: async () => [{ id: bookingId }],
        }),
      }),
    }),
    insert: (_table: any) => ({
      values: (_vals: any) => ({
        returning: async () => [{ id: 'log-1' }],
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'revenue_manager', db: any) {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'manual-verify-test@example.com',
      name: 'Manual verify test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId, role }],
    },
    db,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId, role }], access: 'authenticated' } as any,
  }));
}

describe('payment.manualVerify permission boundary', () => {
  it('denies revenue_manager, which lacks operations.manage_bookings', async () => {
    const app = await caller('revenue_manager', makeDb('pending_verification'));

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets hotel_owner approve a pending_verification booking', async () => {
    const app = await caller('hotel_owner', makeDb('pending_verification'));

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).resolves.toMatchObject({ booking_id: bookingId, status: 'confirmed' });
  });

  it('rejects approving a booking that is not awaiting verification', async () => {
    const app = await caller('hotel_owner', makeDb('confirmed'));

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
