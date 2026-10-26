import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveSignupLinkStatus, generateSignupToken } from './signupLinks';

describe('generateSignupToken', () => {
  it('produces distinct, URL-safe tokens', () => {
    const a = generateSignupToken();
    const b = generateSignupToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('deriveSignupLinkStatus', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');

  it('reports used when used_at is set, regardless of expiry', () => {
    expect(deriveSignupLinkStatus({ expires_at: '2027-01-01T00:00:00.000Z', used_at: '2026-08-29T00:00:00.000Z' }, now)).toBe('used');
  });

  it('reports expired when past expires_at and never used', () => {
    expect(deriveSignupLinkStatus({ expires_at: '2026-08-29T00:00:00.000Z', used_at: null }, now)).toBe('expired');
  });

  it('reports active when neither used nor expired', () => {
    expect(deriveSignupLinkStatus({ expires_at: '2026-09-01T00:00:00.000Z', used_at: null }, now)).toBe('active');
  });
});

const dbMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
  listHotelUserAssignments: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
  createSignupLink: vi.fn(),
  createHotelOwnerMembership: vi.fn(),
  getValidSignupLink: vi.fn(),
  listSignupLinksForHotel: vi.fn(),
  redeemSignupLink: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const superAdminId = 'd93900a0-e7fe-45d6-9364-80ea8a035322';
const newOwnerId = 'a5f0d7d7-7bc7-4aab-8dc6-1b2ee2ba17f3';

async function caller(role: 'super_admin' | 'hotel_owner') {
  const { appRouter } = await import('./routers');
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: superAdminId,
      email: 'user@example.com',
      name: 'Test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId, role }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSignupLink', () => {
  it('lets super_admin generate a link for a hotel with no admin yet', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId, name: 'Little Bro' });
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([]);
    supabaseMocks.createSignupLink.mockResolvedValueOnce({ id: 'link-1', token: 'abc', hotel_id: hotelId, expires_at: '2026-09-01T00:00:00.000Z' });
    const app = await caller('super_admin');

    const result = await app.channelManager.createSignupLink({ hotel_id: hotelId, expiresInHours: 24 });

    expect(result).toMatchObject({ token: 'abc' });
    expect(supabaseMocks.createSignupLink).toHaveBeenCalledWith(hotelId, superAdminId, expect.any(String), expect.any(String));
  });

  it('rejects when the hotel already has a Hotel Admin', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId, name: 'Little Bro' });
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([
      { id: 'm1', hotel_id: hotelId, role: 'hotel_owner' },
    ]);
    const app = await caller('super_admin');

    await expect(app.channelManager.createSignupLink({ hotel_id: hotelId, expiresInHours: 24 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(supabaseMocks.createSignupLink).not.toHaveBeenCalled();
  });

  it('denies a hotel_owner, who lacks platform.manage_signup_links', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createSignupLink({ hotel_id: hotelId, expiresInHours: 24 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(supabaseMocks.createSignupLink).not.toHaveBeenCalled();
  });
});

describe('validateSignupLink', () => {
  it('reports valid with the hotel name for a redeemable token', async () => {
    supabaseMocks.getValidSignupLink.mockResolvedValueOnce({ id: 'link-1', hotel_id: hotelId, token: 'abc', hotelName: 'Little Bro' });
    const app = await caller('super_admin');

    await expect(app.channelManager.validateSignupLink({ token: 'abc' })).resolves.toEqual({ valid: true, hotelName: 'Little Bro' });
  });

  it('reports invalid without leaking why, for an unknown/expired/used token', async () => {
    supabaseMocks.getValidSignupLink.mockResolvedValueOnce(null);
    const app = await caller('super_admin');

    await expect(app.channelManager.validateSignupLink({ token: 'nope' })).resolves.toEqual({ valid: false });
  });
});

describe('completeHotelOwnerSignup', () => {
  it('redeems the token and binds the caller as hotel_owner', async () => {
    supabaseMocks.redeemSignupLink.mockResolvedValueOnce({ id: 'link-1', hotel_id: hotelId });
    const app = await caller('super_admin');

    await expect(app.channelManager.completeHotelOwnerSignup({ token: 'abc' })).resolves.toEqual({ success: true });
    expect(supabaseMocks.redeemSignupLink).toHaveBeenCalledWith('abc', superAdminId);
    expect(supabaseMocks.createHotelOwnerMembership).toHaveBeenCalledWith(hotelId, superAdminId);
  });

  it('rejects an already-used or expired token without touching hotel_users', async () => {
    supabaseMocks.redeemSignupLink.mockResolvedValueOnce(null);
    const app = await caller('super_admin');

    await expect(app.channelManager.completeHotelOwnerSignup({ token: 'stale' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(supabaseMocks.createHotelOwnerMembership).not.toHaveBeenCalled();
  });

  it('rejects when there is no authenticated user (email-confirmation flow)', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: null,
    });
    await expect(app.channelManager.completeHotelOwnerSignup({ token: 'abc', userId: newOwnerId } as any)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(supabaseMocks.redeemSignupLink).not.toHaveBeenCalled();
  });
});
