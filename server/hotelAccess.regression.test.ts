import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  getManagedHotel: vi.fn().mockResolvedValue(null),
  listManagedHotels: vi.fn(),
  listBookingsForHotel: vi.fn(),
  listAvailabilityForHotel: vi.fn(),
  getPublicHotel: vi.fn(),
  createBookingWithGuests: vi.fn(),
  updateAvailability: vi.fn(),
}));

vi.mock('./supabase', () => ({
  createRlsSupabaseClient: vi.fn(() => ({})),
}));

describe('channelManager.hotel', () => {
  it('maps an RLS-hidden hotel UUID to NOT_FOUND rather than an internal server error', async () => {
    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
        email: 'cm-e2e-996d1e8b@msn.com',
        name: 'E2E hotel owner',
        accessToken: 'test-access-token',
        appMetadata: {},
        userMetadata: {},
      },
    });

    await expect(caller.channelManager.hotel('88ed76e4-cc93-4aa7-9c4d-30999d35ada4')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This hotel is not available to your account.',
    });
  });
});
