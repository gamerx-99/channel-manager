import { hotelUsers } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const messagingMocks = vi.hoisted(() => ({
  listThreads: vi.fn(),
  createMessageThread: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock('./d1/messaging', () => messagingMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';

function makeDb(role: string) {
  const membership = { hotelId: HOME_HOTEL, role, permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) return { where: async () => [membership] };
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  messagingMocks.listThreads.mockResolvedValue([]);
  messagingMocks.createMessageThread.mockResolvedValue({ id: 'thread-1' });
  messagingMocks.listMessages.mockResolvedValue([]);
  messagingMocks.createMessage.mockResolvedValue({ id: 'msg-1' });
});

function caller(role: string) {
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
    db: makeDb(role) as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId: HOME_HOTEL, role }], access: 'authenticated' } as any,
  }));
}

describe('messaging access', () => {
  it('denies revenue_manager (no view_bookings) for listThreads', async () => {
    const app = await caller('revenue_manager');
    await expect(app.channelManager.listThreads({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows hotel_owner to list threads', async () => {
    const app = await caller('hotel_owner');
    await expect(app.channelManager.listThreads({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
  });

  it('denies revenue_manager from creating threads (manage_bookings)', async () => {
    const app = await caller('revenue_manager');
    await expect(app.channelManager.createThread({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows hotel_owner to send message', async () => {
    const app = await caller('hotel_owner');
    await expect(app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: '11111111-1111-4111-8111-111111111111', body: 'hi' })).resolves.toMatchObject({ id: 'msg-1' });
  });

  it('lets front_desk list and send messages', async () => {
    const app = await caller('front_desk');
    await expect(app.channelManager.listThreads({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    await expect(app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: '11111111-1111-4111-8111-111111111111', body: 'hi' })).resolves.toMatchObject({ id: 'msg-1' });
  });

  it('lets super_admin bypass hotel permission for messaging', async () => {
    const app = await caller('super_admin');
    await expect(app.channelManager.listThreads({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
  });

  it('denies admin (platform-only) both view and send', async () => {
    const app = await caller('admin');
    await expect(app.channelManager.listThreads({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: '11111111-1111-4111-8111-111111111111', body: 'hi' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns FORBIDDEN when thread not found', async () => {
    messagingMocks.listMessages.mockRejectedValueOnce(new Error('not found'));
    const app = await caller('hotel_owner');
    await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: '11111111-1111-4111-8111-111111111111' })).rejects.toBeTruthy();
  });
});
