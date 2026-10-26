import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  savePromptPaySettings: vi.fn(),
  getManagedHotel: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

beforeEach(() => vi.clearAllMocks());

describe('savePromptPayId MFA', () => {
  it('rejects without recent MFA', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: {
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        accessToken: 'hotel_owner-access-token',
        appMetadata: {},
        userMetadata: {},
        role: 'hotel_owner',
        roles: ['hotel_owner'],
        memberships: [{ hotelId: 'h1', role: 'hotel_owner' }],
      },
    });
    await expect(app.slipok.savePromptPayId({
      hotel_id: 'h1',
      promptpay_id: '1234567890',
      payment_timeout_minutes: 15,
    })).rejects.toThrow();
    expect(dbMocks.savePromptPaySettings).not.toHaveBeenCalled();
  });
});