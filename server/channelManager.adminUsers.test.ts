import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createHotelUserAssignment: vi.fn(),
  deleteHotelUserAssignment: vi.fn(),
  getManagedHotel: vi.fn(),
  isSuperAdmin: vi.fn(),
  listHotelOptions: vi.fn(),
  listHotelUserAssignments: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
  deleteAuthUser: vi.fn(),
  getAuthUser: vi.fn(),
  inviteAuthUser: vi.fn(),
  listAuthUsers: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.isSuperAdmin.mockResolvedValue(true);
  supabaseMocks.listAuthUsers.mockResolvedValue([]);
  dbMocks.listHotelUserAssignments.mockResolvedValue([]);
  dbMocks.listHotelOptions.mockResolvedValue([]);
});

function caller(role: 'super_admin' | 'hotel_owner' = 'super_admin') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'admin-test@example.com',
      name: 'Admin test user',
      accessToken: `${role}-access-token`,
      appMetadata: { role },
      userMetadata: {},
      roles: [role],
      memberships: role === 'hotel_owner' ? [{ hotelId, role }] : [],
    },
  }));
}

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const otherUserId = 'a5f0d7d7-7bc7-4aab-8dc6-1b2ee2ba17f3';
const membershipId = 'c5b0b6e1-6a11-4c90-bb12-3f9a4583df45';

const membership = {
  id: membershipId,
  hotel_id: hotelId,
  user_id: otherUserId,
  role: 'hotel_owner' as const,
  created_at: '2026-08-18T00:00:00.000Z',
  hotels: { name: 'Little Bro' },
};

describe('channelManager.adminUsers authorization', () => {
  it('rejects hotel owners before reading Auth users or memberships', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.adminUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(supabaseMocks.createRlsSupabaseClient).not.toHaveBeenCalled();
    expect(supabaseMocks.listAuthUsers).not.toHaveBeenCalled();
    expect(dbMocks.listHotelUserAssignments).not.toHaveBeenCalled();
  });

  it('lists Auth users and RLS-visible assignments for a super admin', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    supabaseMocks.listAuthUsers.mockResolvedValueOnce([{ id: otherUserId, email: 'owner@example.com' }]);
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([membership]);
    const app = await caller();

    await expect(app.channelManager.adminUsers()).resolves.toEqual({
      users: [{ id: otherUserId, email: 'owner@example.com' }],
      assignments: [membership],
    });
    expect(dbMocks.isSuperAdmin).toHaveBeenCalledWith(client);
    expect(dbMocks.listHotelUserAssignments).toHaveBeenCalledWith(client);
  });
});

describe('channelManager.inviteAdminUser', () => {
  it('rejects malformed email before calling the Auth Admin API', async () => {
    const app = await caller();

    await expect(app.channelManager.inviteAdminUser({
      email: 'not-an-email',
      hotel_id: hotelId,
      role: 'hotel_owner',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(supabaseMocks.inviteAuthUser).not.toHaveBeenCalled();
  });

  it('invites a normalized email and creates its RLS-scoped membership', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId });
    supabaseMocks.inviteAuthUser.mockResolvedValueOnce({ id: otherUserId, email: 'owner@example.com' });
    dbMocks.createHotelUserAssignment.mockResolvedValueOnce(membership);
    const app = await caller();

    await expect(app.channelManager.inviteAdminUser({
      email: ' Owner@Example.COM ',
      hotel_id: hotelId,
      role: 'hotel_owner',
    })).resolves.toEqual({
      user: { id: otherUserId, email: 'owner@example.com' },
      membership,
    });
    expect(supabaseMocks.inviteAuthUser).toHaveBeenCalledWith('owner@example.com');
    expect(dbMocks.createHotelUserAssignment).toHaveBeenCalledWith(client, {
      user_id: otherUserId,
      hotel_id: hotelId,
      role: 'hotel_owner',
    });
  });
});

describe('channelManager.assignAdminUser', () => {
  it('requires the selected Auth user and hotel to exist before inserting membership', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    supabaseMocks.getAuthUser.mockResolvedValueOnce(null);
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId });
    const app = await caller();

    await expect(app.channelManager.assignAdminUser({
      user_id: otherUserId,
      hotel_id: hotelId,
      role: 'hotel_owner',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(dbMocks.createHotelUserAssignment).not.toHaveBeenCalled();
  });

  it('passes existing user, hotel and role through the RLS insert helper', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    supabaseMocks.getAuthUser.mockResolvedValueOnce({ id: otherUserId, email: 'owner@example.com' });
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId });
    dbMocks.createHotelUserAssignment.mockResolvedValueOnce(membership);
    const app = await caller();

    await expect(app.channelManager.assignAdminUser({
      user_id: otherUserId,
      hotel_id: hotelId,
      role: 'hotel_owner',
    })).resolves.toEqual(membership);
    expect(dbMocks.createHotelUserAssignment).toHaveBeenCalledWith(client, {
      user_id: otherUserId,
      hotel_id: hotelId,
      role: 'hotel_owner',
    });
  });
});

describe('channelManager.removeAdminMembership', () => {
  it('prevents removing the last super-admin membership for the current user', async () => {
    dbMocks.listHotelUserAssignments.mockResolvedValue([{
      ...membership,
      id: membershipId,
      user_id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      role: 'super_admin',
    }]);
    const app = await caller();

    await expect(app.channelManager.removeAdminMembership({ membership_id: membershipId })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(dbMocks.deleteHotelUserAssignment).not.toHaveBeenCalled();
  });

  it('removes an existing membership and returns its id', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelUserAssignments.mockResolvedValue([membership]);
    dbMocks.deleteHotelUserAssignment.mockResolvedValueOnce({ id: membershipId });
    const app = await caller();

    await expect(app.channelManager.removeAdminMembership({ membership_id: membershipId })).resolves.toEqual({ success: true, id: membershipId });
    expect(dbMocks.deleteHotelUserAssignment).toHaveBeenCalledWith(client, membershipId);
  });
});
