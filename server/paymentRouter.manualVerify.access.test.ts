import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  updateBookingPaymentStatus: vi.fn(),
  logBookingStatusChange: vi.fn(),
}));

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const bookingId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function makeFakeBookingsTable(bookingRow: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: bookingRow, error: null }),
        }),
      }),
    }),
    update: (_patch: Record<string, unknown>) => ({
      eq: async () => ({ error: null }),
    }),
  };
}

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'revenue_manager') {
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
  }));
}

describe('payment.manualVerify permission boundary', () => {
  it('denies revenue_manager, which lacks operations.manage_bookings', async () => {
    const app = await caller('revenue_manager');

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(supabaseMocks.createRlsSupabaseClient).not.toHaveBeenCalled();
  });

  it('lets hotel_owner approve a pending_verification booking', async () => {
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce({
      from: (table: string) => {
        if (table === 'bookings') {
          return makeFakeBookingsTable({ id: bookingId, hotel_id: hotelId, status: 'pending_verification' });
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });
    const app = await caller('hotel_owner');

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).resolves.toMatchObject({ booking_id: bookingId, status: 'confirmed' });

    expect(dbMocks.updateBookingPaymentStatus).toHaveBeenCalledWith(expect.anything(), bookingId, 'verified');
    expect(dbMocks.logBookingStatusChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      booking_id: bookingId,
      from_status: 'pending_verification',
      to_status: 'confirmed',
      changed_by: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
    }));
  });

  it('rejects approving a booking that is not awaiting verification', async () => {
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce({
      from: (table: string) => {
        if (table === 'bookings') {
          return makeFakeBookingsTable({ id: bookingId, hotel_id: hotelId, status: 'confirmed' });
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });
    const app = await caller('hotel_owner');

    await expect(app.payment.manualVerify({
      booking_id: bookingId,
      hotel_id: hotelId,
      approved: true,
    })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    expect(dbMocks.updateBookingPaymentStatus).not.toHaveBeenCalled();
  });
});
