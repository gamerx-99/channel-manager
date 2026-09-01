/**
 * Regression test for rethrowDomainError's TRPCError passthrough
 * (server/routers.ts:334). Before the fix, a TRPCError thrown inside any of
 * the ~44 unguarded `catch (error) { return rethrowDomainError(error); }`
 * call sites was re-derived from error.message and, when the message didn't
 * match a known Postgres/domain pattern, silently downgraded to
 * INTERNAL_SERVER_ERROR — losing the original FORBIDDEN/NOT_FOUND/etc code.
 * notifications.list's `hotelId` omitted + non-super_admin branch is one
 * such unguarded site: it throws FORBIDDEN before ever touching the db.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  listAllNotifications: vi.fn(),
  listNotifications: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

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
      memberships: [],
    },
  }));
}

describe('rethrowDomainError TRPCError passthrough', () => {
  it('preserves FORBIDDEN thrown inside an unguarded try block instead of downgrading to INTERNAL_SERVER_ERROR', async () => {
    const app = await caller('hotel_owner');

    await expect(app.notifications.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listAllNotifications).not.toHaveBeenCalled();
    expect(dbMocks.listNotifications).not.toHaveBeenCalled();
  });
});
