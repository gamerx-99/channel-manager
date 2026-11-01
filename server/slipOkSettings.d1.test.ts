import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const dbMocks = vi.hoisted(() => ({
  getSlipOkSettings: vi.fn(),
  saveSlipOkSettings: vi.fn(),
  removeSlipOkKey: vi.fn(),
}));
const cryptoMocks = vi.hoisted(() => ({
  encryptSlipOkKey: vi.fn((key: string) => `encrypted:${key}`),
  hashSlipOkKey: vi.fn((key: string) => `hash:${key}`),
}));
const mfaMocks = vi.hoisted(() => ({
  requireRecentMfaVerification: vi.fn(),
}));

vi.mock('./d1/payment', () => dbMocks);
vi.mock('./slipokCrypto', () => cryptoMocks);
vi.mock('./mfa', () => mfaMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';

beforeEach(() => {
  vi.clearAllMocks();
  mfaMocks.requireRecentMfaVerification.mockReset();
});

function caller(role: 'hotel_owner' | 'super_admin' | 'front_desk' = 'hotel_owner') {
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
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('slipok.saveKey (D1 router)', () => {
  it('rejects a request missing branch_id (SlipOK requires both credentials)', async () => {
    const app = await caller();
    await expect(
      app.slipok.saveKey({ hotel_id: HOME_HOTEL, api_key: 'a-real-looking-key', branch_id: '' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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
    expect(cryptoMocks.hashSlipOkKey).toHaveBeenCalledWith('a-real-looking-key');
    expect(dbMocks.saveSlipOkSettings).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      HOME_HOTEL,
      'encrypted:a-real-looking-key',
      'hash:a-real-looking-key',
      'branch-42',
    );
    expect(mfaMocks.requireRecentMfaVerification).toHaveBeenCalled();
  });
});

describe('SlipOK settings access boundaries', () => {
  const operations = ['getSettings', 'saveKey', 'removeKey'] as const;
  const input = { hotel_id: HOME_HOTEL, api_key: 'a-real-looking-key', branch_id: 'branch-42' };

  it.each(operations)('rejects %s without property.manage_profile before accessing credentials', async operation => {
    const app = await caller('front_desk');
    await expect(app.slipok[operation](input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const mock of Object.values(dbMocks)) expect(mock).not.toHaveBeenCalled();
    expect(cryptoMocks.encryptSlipOkKey).not.toHaveBeenCalled();
    expect(mfaMocks.requireRecentMfaVerification).not.toHaveBeenCalled();
  });

  it.each(operations)('rejects %s for another hotel before accessing credentials', async operation => {
    const app = await caller();
    await expect(app.slipok[operation]({ ...input, hotel_id: 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const mock of Object.values(dbMocks)) expect(mock).not.toHaveBeenCalled();
    expect(cryptoMocks.encryptSlipOkKey).not.toHaveBeenCalled();
  });

  it.each(operations)('rejects %s when recent MFA verification fails before accessing credentials', async operation => {
    mfaMocks.requireRecentMfaVerification.mockImplementationOnce(() => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Recent MFA verification required.' });
    });
    const app = await caller();
    await expect(app.slipok[operation](input)).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Recent MFA verification required.' });
    for (const mock of Object.values(dbMocks)) expect(mock).not.toHaveBeenCalled();
    expect(cryptoMocks.encryptSlipOkKey).not.toHaveBeenCalled();
  });
});

describe('slipok.getSettings (D1 router)', () => {
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
    expect(mfaMocks.requireRecentMfaVerification).toHaveBeenCalled();
  });
});

describe('slipok.removeKey (D1 router)', () => {
  it('clears both the key and branch_id', async () => {
    dbMocks.removeSlipOkKey.mockResolvedValueOnce(undefined);
    const app = await caller();

    const result = await app.slipok.removeKey({ hotel_id: HOME_HOTEL });

    expect(result).toEqual({ success: true });
    expect(dbMocks.removeSlipOkKey).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      HOME_HOTEL,
    );
    expect(mfaMocks.requireRecentMfaVerification).toHaveBeenCalled();
  });
});
