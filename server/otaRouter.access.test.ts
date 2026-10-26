import { beforeEach, describe, expect, it, vi } from 'vitest';

const otaMocks = vi.hoisted(() => ({
  getOtaConnections: vi.fn(),
  getGlobalOtaSummary: vi.fn(),
  upsertOtaConnection: vi.fn(),
  deleteOtaConnection: vi.fn(),
  getOtaSyncLogs: vi.fn(),
  triggerOtaCalendarSync: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./otaSync', () => otaMocks);
vi.mock('./supabase', () => supabaseMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'admin' | 'hotel_owner' | 'revenue_manager' | 'front_desk', hotelId = HOME_HOTEL) {
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
      memberships: [{ hotelId, role }],
    },
  }));
}

describe('OTA router access', () => {
  it('lets hotel_owner manage connections and trigger sync for its hotel', async () => {
    otaMocks.triggerOtaCalendarSync.mockResolvedValueOnce({ success: true });
    otaMocks.upsertOtaConnection.mockResolvedValueOnce({ id: 'connection-1' });
    otaMocks.deleteOtaConnection.mockResolvedValueOnce(undefined);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.triggerSync({ hotelId: HOME_HOTEL, provider: 'airbnb' })).resolves.toEqual({ success: true });
    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl: 'https://example.com/feed.ics' })).resolves.toEqual({ id: 'connection-1' });
    await expect(app.channelManager.ota.deleteConnection({ hotelId: HOME_HOTEL, provider: 'airbnb' })).resolves.toEqual({ success: true });
    expect(otaMocks.triggerOtaCalendarSync).toHaveBeenCalled();
    expect(otaMocks.upsertOtaConnection).toHaveBeenCalled();
    expect(otaMocks.deleteOtaConnection).toHaveBeenCalled();
  });

  it.each(['front_desk', 'revenue_manager', 'admin'] as const)('forbids %s from modifying OTA connections or triggering sync', async role => {
    const app = await caller(role);

    await expect(app.channelManager.ota.triggerSync({ hotelId: HOME_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl: 'https://example.com/feed.ics' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.ota.deleteConnection({ hotelId: HOME_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(otaMocks.triggerOtaCalendarSync).not.toHaveBeenCalled();
    expect(otaMocks.upsertOtaConnection).not.toHaveBeenCalled();
    expect(otaMocks.deleteOtaConnection).not.toHaveBeenCalled();
  });

  it('lets front_desk read connections and logs for its hotel', async () => {
    otaMocks.getOtaConnections.mockResolvedValueOnce([]);
    otaMocks.getOtaSyncLogs.mockResolvedValueOnce([]);
    const app = await caller('front_desk');

    await expect(app.channelManager.ota.listConnections({ hotelId: HOME_HOTEL })).resolves.toEqual([]);
    await expect(app.channelManager.ota.listLogs({ hotelId: HOME_HOTEL })).resolves.toEqual([]);
    expect(otaMocks.getOtaConnections).toHaveBeenCalled();
    expect(otaMocks.getOtaSyncLogs).toHaveBeenCalled();
  });

  it.each(['http://169.254.169.254/latest/meta-data/', 'http://localhost/feed.ics', 'not a url'])('rejects saving a non-public import URL: %s', async icalImportUrl => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(otaMocks.upsertOtaConnection).not.toHaveBeenCalled();
  });

  it('forbids a hotel_owner from triggering sync for a different hotel', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.triggerSync({ hotelId: OTHER_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(otaMocks.triggerOtaCalendarSync).not.toHaveBeenCalled();
  });
});
