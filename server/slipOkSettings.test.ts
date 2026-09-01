/**
 * Phase 01 — router-level tests for the slipok.* settings procedures.
 * Covers the branch_id + api_key two-credential contract (see
 * server/slipVerification.ts for why both are required) and that the raw
 * key is never returned to the caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getSlipOkSettings: vi.fn(),
  saveSlipOkSettings: vi.fn(),
  removeSlipOkKey: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));
const cryptoMocks = vi.hoisted(() => ({
  encryptSlipOkKey: vi.fn((key: string) => `encrypted:${key}`),
  hashSlipOkKey: vi.fn((key: string) => `hash:${key}`),
}));
const mfaMocks = vi.hoisted(() => ({
  requireRecentMfaVerification: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);
vi.mock('./slipokCrypto', () => cryptoMocks);
vi.mock('./mfa', () => mfaMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'super_admin' = 'hotel_owner') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'user@example.com',
      name: 'Test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId: HOME_HOTEL, role }],
    },
  }));
}

describe('slipok.saveKey', () => {
  it('rejects a request missing branch_id (SlipOK requires both credentials)', async () => {
    const app = await caller();
    await expect(
      app.slipok.saveKey({ hotel_id: HOME_HOTEL, api_key: 'a-real-looking-key', branch_id: '' } as never),
    ).rejects.toBeTruthy();
    expect(dbMocks.saveSlipOkSettings).not.toHaveBeenCalled();
  });

  it('encrypts the key and stores branch_id in plaintext alongside it', async () => {
    dbMocks.saveSlipOkSettings.mockResolvedValueOnce(undefined);
    const app = await caller();

    const result = await app.slipok.saveKey({
      hotel_id: HOME_HOTEL,
      api_key: 'a-real-looking-key',
      branch_id: 'branch-42',
    });

    expect(result).toEqual({ success: true });
    expect(cryptoMocks.encryptSlipOkKey).toHaveBeenCalledWith('a-real-looking-key');
    expect(dbMocks.saveSlipOkSettings).toHaveBeenCalledWith(
      { requestScoped: true },
      HOME_HOTEL,
      'encrypted:a-real-looking-key',
      'hash:a-real-looking-key',
      'branch-42',
    );
    expect(mfaMocks.requireRecentMfaVerification).toHaveBeenCalled();
  });
});

describe('slipok.getSettings', () => {
  it('returns configured/enabled/branchId without ever exposing the raw or encrypted key', async () => {
    dbMocks.getSlipOkSettings.mockResolvedValueOnce({
      configured: true,
      enabled: true,
      branchId: 'branch-42',
    });
    const app = await caller();

    const result = await app.slipok.getSettings({ hotel_id: HOME_HOTEL });

    expect(result).toEqual({ configured: true, enabled: true, branchId: 'branch-42' });
    expect(JSON.stringify(result)).not.toContain('key');
  });
});

describe('slipok.removeKey', () => {
  it('clears both the key and branch_id', async () => {
    dbMocks.removeSlipOkKey.mockResolvedValueOnce(undefined);
    const app = await caller();

    const result = await app.slipok.removeKey({ hotel_id: HOME_HOTEL });

    expect(result).toEqual({ success: true });
    expect(dbMocks.removeSlipOkKey).toHaveBeenCalledWith({ requestScoped: true }, HOME_HOTEL);
    expect(mfaMocks.requireRecentMfaVerification).toHaveBeenCalled();
  });
});
