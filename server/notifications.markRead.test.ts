import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  markNotificationRead: vi.fn(),
  listNotifications: vi.fn(),
  listAllNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markSystemNotificationsRead: vi.fn(),
  insertNotification: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

beforeEach(() => vi.clearAllMocks());

function caller() {
  return import('./routers').then(({ appRouter }) =>
    appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        accessToken: 'token',
        appMetadata: {},
        userMetadata: {},
        role: 'hotel_owner',
        roles: ['hotel_owner'],
        memberships: [{ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', role: 'hotel_owner' }],
      },
    }),
  );
}

describe('markRead scoping', () => {
  it('fails validation when hotelId is missing', async () => {
    const app = await caller();
    await expect(app.notifications.markRead({ notificationId: 'n1' } as any)).rejects.toThrow();
    expect(dbMocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it('filters by both id and hotel_id', async () => {
    dbMocks.markNotificationRead.mockResolvedValueOnce({ id: 'n1' });
    const app = await caller();
    await app.notifications.markRead({ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', notificationId: '99999999-9999-4999-8999-999999999999' });
    expect(dbMocks.markNotificationRead).toHaveBeenCalledWith({ mocked: true }, '99999999-9999-4999-8999-999999999999', '88ed76e4-cc93-4aa7-9c4d-30999d35ada4');
  });
});