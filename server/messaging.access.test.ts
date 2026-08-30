import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = '99ed76e4-cc93-4aa7-9c4d-30999d35ada5';
const THREAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_THREAD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_BOOKING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type ThreadRow = { id: string; hotel_id: string; booking_id: string | null };
type BookingRow = { hotel_id: string };

const dbMocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  createMessage: vi.fn(),
}));

// Controlled mock for RLS client .from() per test
let mockThreadRow: ThreadRow | null = null;
let mockBookingRow: BookingRow | null = null;

function makeRlsClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'message_threads') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockThreadRow, error: null }),
        } as any;
      }
      if (table === 'bookings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockBookingRow, error: null }),
        } as any;
      }
      // Fallback for other tables (should not be hit in messaging tests)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    }),
  } as any;
}

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => makeRlsClient()),
}));

// Need to re-assign after definition because vi.hoisted can't close over makeRlsClient defined later
// So we patch: the mock will call the outer makeRlsClient via a mutable reference set in beforeEach.
let rlsClientInstance: any = null;

vi.mock('./db', async () => {
  const actual = await vi.importActual<typeof import('./db')>('./db');
  return {
    ...actual,
    listMessages: dbMocks.listMessages,
    createMessage: dbMocks.createMessage,
  };
});

vi.mock('./supabase', () => ({
  createRlsSupabaseClient: (...args: any[]) => {
    // Use the dynamically set rlsClientInstance if available, else fallback
    if (rlsClientInstance) return rlsClientInstance;
    return supabaseMocks.createRlsSupabaseClient(...args);
  },
  // Re-export other helpers that routers might import but we don't test here — keep them as no-ops
  createSupabaseAdminClient: vi.fn(),
  listAuthUsers: vi.fn(),
  inviteAuthUser: vi.fn(),
  getAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  createSignupLink: vi.fn(),
  listSignupLinksForHotel: vi.fn(),
  getValidSignupLink: vi.fn(),
  redeemSignupLink: vi.fn(),
  createHotelOwnerMembership: vi.fn(),
}));

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager' | 'front_desk' | 'housekeeping') {
  return import('./routers').then(({ appRouter }) =>
    appRouter.createCaller({
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
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockThreadRow = { id: THREAD_ID, hotel_id: HOME_HOTEL, booking_id: BOOKING_ID };
  mockBookingRow = { hotel_id: HOME_HOTEL };
  rlsClientInstance = makeRlsClient();
  dbMocks.listMessages.mockResolvedValue([
    { id: 'msg-1', thread_id: THREAD_ID, sender_user_id: 'user-1', body: 'hello', created_at: new Date().toISOString() },
  ]);
  dbMocks.createMessage.mockResolvedValue({
    id: 'msg-2',
    thread_id: THREAD_ID,
    sender_user_id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
    body: 'hello',
    created_at: new Date().toISOString(),
  });
});

describe('messaging access — operations.view_bookings / operations.manage_bookings', () => {
  it('lets hotel_owner list and send messages in own hotel thread', async () => {
    const app = await caller('hotel_owner');
    await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ thread_id: THREAD_ID })]),
    );
    expect(dbMocks.listMessages).toHaveBeenCalledWith(expect.anything(), THREAD_ID);

    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hello' }),
    ).resolves.toMatchObject({ thread_id: THREAD_ID, body: 'hello' });
    expect(dbMocks.createMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ thread_id: THREAD_ID, body: 'hello' }),
    );
  });

  it('lets front_desk list and send messages', async () => {
    const app = await caller('front_desk');
    await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID })).resolves.toBeDefined();
    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hi' }),
    ).resolves.toBeDefined();
  });

  it('lets super_admin bypass hotel permission for messaging', async () => {
    const app = await caller('super_admin');
    await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID })).resolves.toBeDefined();
    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hi' }),
    ).resolves.toBeDefined();
  });

  it('lets admin (read-only platform) view but not send', async () => {
    const app = await caller('admin');
    await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID })).resolves.toBeDefined();
    expect(dbMocks.listMessages).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    // keep thread visible so permission gate is the reason for failure, not thread scope
    mockThreadRow = { id: THREAD_ID, hotel_id: HOME_HOTEL, booking_id: null };
    mockBookingRow = null;
    rlsClientInstance = makeRlsClient();

    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.createMessage).not.toHaveBeenCalled();
  });

  it('denies revenue_manager and housekeeping for both view and manage', async () => {
    for (const role of ['revenue_manager', 'housekeeping'] as const) {
      vi.clearAllMocks();
      mockThreadRow = { id: THREAD_ID, hotel_id: HOME_HOTEL, booking_id: null };
      rlsClientInstance = makeRlsClient();
      dbMocks.listMessages.mockResolvedValue([]);
      const app = await caller(role);
      await expect(app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hi' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(dbMocks.listMessages).not.toHaveBeenCalled();
    expect(dbMocks.createMessage).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when thread belongs to a different hotel (cross-hotel scope)', async () => {
    // Thread is in OTHER_HOTEL, caller asks with HOME_HOTEL
    mockThreadRow = { id: OTHER_THREAD_ID, hotel_id: OTHER_HOTEL, booking_id: null };
    rlsClientInstance = makeRlsClient();
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: OTHER_THREAD_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listMessages).not.toHaveBeenCalled();

    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: OTHER_THREAD_ID, body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.createMessage).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when thread booking belongs to different hotel', async () => {
    // Thread says it belongs to HOME_HOTEL (so hotel_id check passes), but its linked booking belongs to OTHER_HOTEL
    mockThreadRow = { id: THREAD_ID, hotel_id: HOME_HOTEL, booking_id: OTHER_BOOKING_ID };
    mockBookingRow = { hotel_id: OTHER_HOTEL };
    rlsClientInstance = makeRlsClient();
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      app.channelManager.sendMessage({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID, body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns FORBIDDEN when thread not found', async () => {
    mockThreadRow = null;
    rlsClientInstance = makeRlsClient();
    const app = await caller('hotel_owner');
    await expect(
      app.channelManager.listMessages({ hotel_id: HOME_HOTEL, thread_id: THREAD_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
