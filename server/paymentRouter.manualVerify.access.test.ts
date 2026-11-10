import { bookings, hotelUsers, paymentSessions } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function makeDb(status: string | null) {
  const membership = { hotelId, role: 'hotel_owner', permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  const booking = status ? { id: bookingId, hotelId, status } : null;
  const sessionWrites: Array<Record<string, unknown>> = [];
  const db = {
    $client: { prepare: () => ({ bind: () => ({}) }), batch: vi.fn(async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]) },
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) {
          return { where: async () => [membership] };
        }
        if (table === paymentSessions) {
          return { where: () => ({ orderBy: () => ({ limit: async () => [{ id: 'session-1', bookingId, hotelId, amount: '120.00', status: 'pending', qrReference: 'ref', qrString: null, expiresAt: new Date('2099-01-01T00:00:00.000Z'), verifiedAt: null, slipUrl: null, createdAt: new Date('2026-01-01T00:00:00.000Z') }] }) }) };
        }
        return {
          where: () => ({
            limit: async () => (booking ? [booking] : []),
          }),
        };
      },
    }),
    update: (table: any) => ({
      set: (_patch: any) => ({
        where: () => ({
          returning: async () => {
            if (table === paymentSessions) sessionWrites.push(_patch);
            return table === paymentSessions ? [{ id: 'session-1', bookingId, hotelId, amount: '120.00', status: _patch.status, qrReference: 'ref', qrString: null, expiresAt: new Date('2099-01-01T00:00:00.000Z'), verifiedAt: _patch.verifiedAt, slipUrl: null, createdAt: new Date('2026-01-01T00:00:00.000Z') }] : [{ id: bookingId }];
          },
        }),
      }),
    }),
    insert: (_table: any) => ({
      values: (_vals: any) => ({
        returning: async () => [{ id: 'log-1' }],
      }),
    }),
  };
  return { db, sessionWrites };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'revenue_manager', db: any, candidateEnabled = true) {
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
    billingEnv: candidateEnabled ? { BILLING_CANDIDATE_ENABLED: 'true' } : undefined,
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
    const { db, sessionWrites } = makeDb('pending_verification');
    const app = await caller('hotel_owner', db);

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
      amount: '120.00',
      transaction_reference: 'BANK-REF-1',
    })).resolves.toMatchObject({ booking_id: bookingId, status: 'confirmed' });
    expect(db.$client.batch).toHaveBeenCalledOnce();
  });

  it('preserves the legacy approval flow when the candidate flag is absent', async () => {
    const { db, sessionWrites } = makeDb('pending_verification');
    const app = await caller('hotel_owner', db, false);

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).resolves.toMatchObject({ booking_id: bookingId, status: 'confirmed' });
    expect(sessionWrites).toEqual([{ status: 'paid', verifiedAt: expect.any(Date) }]);
    expect(db.$client.batch).not.toHaveBeenCalled();
  });

  it('closes the payment session as failed when the hotel rejects the slip', async () => {
    const { db, sessionWrites } = makeDb('pending_verification');
    const app = await caller('hotel_owner', db);

    await expect(app.payment.manualVerify({ booking_id: bookingId, hotel_id: hotelId, approved: false })).resolves.toMatchObject({ status: 'payment_rejected' });
    expect(sessionWrites).toEqual([{ status: 'failed' }]);
  });

  it('rejects approving a booking that is not awaiting verification', async () => {
    const { db } = makeDb('confirmed');
    const app = await caller('hotel_owner', db);

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
