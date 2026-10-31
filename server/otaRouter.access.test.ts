import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const otaMocks = vi.hoisted(() => ({
  listOtaConnections: vi.fn(),
  upsertOtaConnection: vi.fn(),
  deleteOtaConnection: vi.fn(),
  listOtaSyncLogs: vi.fn(),
  getOtaSummary: vi.fn(),
  triggerOtaCalendarSyncD1: vi.fn(),
}));

vi.mock('./d1/ota', () => otaMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  await import('./routers');
}, 30_000);

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
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('OTA router access', () => {
  it('lets hotel_owner manage connections and trigger sync for its hotel', async () => {
    otaMocks.triggerOtaCalendarSyncD1.mockResolvedValueOnce({ success: true });
    otaMocks.upsertOtaConnection.mockResolvedValueOnce({ id: 'connection-1' });
    otaMocks.deleteOtaConnection.mockResolvedValueOnce(undefined);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.triggerSync({ hotelId: HOME_HOTEL, provider: 'airbnb' })).resolves.toEqual({ success: true });
    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl: 'https://example.com/feed.ics' })).resolves.toEqual({ id: 'connection-1' });
    await expect(app.channelManager.ota.deleteConnection({ hotelId: HOME_HOTEL, provider: 'airbnb' })).resolves.toEqual({ success: true });
    expect(otaMocks.triggerOtaCalendarSyncD1).toHaveBeenCalled();
    expect(otaMocks.upsertOtaConnection).toHaveBeenCalled();
    expect(otaMocks.deleteOtaConnection).toHaveBeenCalled();
  });

  it.each(['front_desk', 'revenue_manager', 'admin'] as const)('forbids %s from modifying OTA connections or triggering sync', async role => {
    const app = await caller(role);

    await expect(app.channelManager.ota.triggerSync({ hotelId: HOME_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl: 'https://example.com/feed.ics' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.ota.deleteConnection({ hotelId: HOME_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(otaMocks.triggerOtaCalendarSyncD1).not.toHaveBeenCalled();
    expect(otaMocks.upsertOtaConnection).not.toHaveBeenCalled();
    expect(otaMocks.deleteOtaConnection).not.toHaveBeenCalled();
  });

  it('lets front_desk read connections and logs for its hotel', async () => {
    otaMocks.listOtaConnections.mockResolvedValueOnce([]);
    otaMocks.listOtaSyncLogs.mockResolvedValueOnce([]);
    const app = await caller('front_desk');

    await expect(app.channelManager.ota.listConnections({ hotelId: HOME_HOTEL })).resolves.toEqual([]);
    await expect(app.channelManager.ota.listLogs({ hotelId: HOME_HOTEL })).resolves.toEqual([]);
    expect(otaMocks.listOtaConnections).toHaveBeenCalled();
    expect(otaMocks.listOtaSyncLogs).toHaveBeenCalled();
  });

  it.each(['http://169.254.169.254/latest/meta-data/', 'http://localhost/feed.ics', 'not a url'])('rejects saving a non-public import URL: %s', async icalImportUrl => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.upsertConnection({ hotelId: HOME_HOTEL, provider: 'airbnb', status: 'active', icalImportUrl })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(otaMocks.upsertOtaConnection).not.toHaveBeenCalled();
  });

  it('rejects a connection mapped to both a room and a room type', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.upsertConnection({
      hotelId: HOME_HOTEL,
      provider: 'Booking.com - Deluxe',
      status: 'active',
      roomId: '22222222-2222-4222-8222-222222222222',
      roomTypeId: '33333333-3333-4333-8333-333333333333',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(otaMocks.upsertOtaConnection).not.toHaveBeenCalled();
  });

  it('passes a room-type mapping through to the data layer', async () => {
    otaMocks.upsertOtaConnection.mockResolvedValueOnce({ id: 'connection-2' });
    const app = await caller('hotel_owner');

    await app.channelManager.ota.upsertConnection({
      hotelId: HOME_HOTEL,
      provider: 'Booking.com - Deluxe',
      status: 'active',
      roomTypeId: '33333333-3333-4333-8333-333333333333',
    });
    const call = otaMocks.upsertOtaConnection.mock.calls[0][2];
    expect(call.roomId).toBeUndefined();
    expect(call.roomTypeId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('forbids a hotel_owner from triggering sync for a different hotel', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.ota.triggerSync({ hotelId: OTHER_HOTEL, provider: 'airbnb' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(otaMocks.triggerOtaCalendarSyncD1).not.toHaveBeenCalled();
  });
});
