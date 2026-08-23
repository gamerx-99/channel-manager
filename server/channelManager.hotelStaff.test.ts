import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createHotelUserAssignment: vi.fn(),
  deleteHotelUserAssignment: vi.fn(),
  getManagedHotel: vi.fn(),
  listHotelStaff: vi.fn(),
  listHotelUserAssignments: vi.fn(),
  listHotelAdminAuditLogs: vi.fn(),
  updateHotelUserAssignmentRole: vi.fn(),
  transferHotelAdmin: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
  deleteAuthUser: vi.fn(),
  inviteAuthUser: vi.fn(),
  listAuthUsers: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const otherHotelId = 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a';
const ownerId = 'd93900a0-e7fe-45d6-9364-80ea8a035322';
const staffId = 'a5f0d7d7-7bc7-4aab-8dc6-1b2ee2ba17f3';
const membershipId = 'c5b0b6e1-6a11-4c90-bb12-3f9a4583df45';

const owner = {
  id: ownerId,
  email: 'owner@example.com',
  name: 'Property owner',
  accessToken: 'hotel-owner-access-token',
  appMetadata: { role: 'hotel_owner' as const },
  userMetadata: {},
  roles: ['hotel_owner' as const],
  memberships: [{ hotelId, role: 'hotel_owner' as const }],
};

const hotel = { id: hotelId, name: 'Little Bro' };
const staffMembership = {
  id: membershipId,
  hotel_id: hotelId,
  user_id: staffId,
  role: 'front_desk' as const,
  created_at: '2026-08-19T00:00:00.000Z',
  hotels: { name: hotel.name },
};
const ownerMembership = {
  ...staffMembership,
  id: 'f58f5c7e-17c3-4ce8-9ce0-2ae13de12d9a',
  user_id: ownerId,
  role: 'hotel_owner' as const,
};

async function caller(user = owner) {
  const { appRouter } = await import('./routers');
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getManagedHotel.mockResolvedValue(hotel);
  dbMocks.listHotelUserAssignments.mockResolvedValue([ownerMembership, staffMembership]);
  dbMocks.listHotelStaff.mockResolvedValue([staffMembership]);
  dbMocks.listHotelAdminAuditLogs.mockResolvedValue([]);
  dbMocks.updateHotelUserAssignmentRole.mockResolvedValue({ ...staffMembership, role: 'revenue_manager' });
  dbMocks.transferHotelAdmin.mockResolvedValue({ ...staffMembership, role: 'hotel_owner' });
  dbMocks.deleteHotelUserAssignment.mockResolvedValue({ id: membershipId });
  supabaseMocks.listAuthUsers.mockResolvedValue([
    { id: ownerId, email: owner.email },
    { id: staffId, email: 'frontdesk@example.com' },
  ]);
});

describe('channelManager.hotelStaff', () => {
  it('rejects a Hotel Admin from a hotel outside their membership scope', async () => {
    const app = await caller();

    await expect(app.channelManager.hotelStaff({ hotel_id: otherHotelId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.getManagedHotel).not.toHaveBeenCalled();
    expect(supabaseMocks.listAuthUsers).not.toHaveBeenCalled();
  });

  it('lists only the selected hotel staff through the RLS-scoped helper', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    const app = await caller();

    await expect(app.channelManager.hotelStaff({ hotel_id: hotelId })).resolves.toEqual({
      hotel,
      staff: [staffMembership],
    });
    expect(dbMocks.listHotelStaff).toHaveBeenCalledWith(client, hotelId, expect.any(Array));
  });
});

describe('channelManager.listHotelAdminAuditLogs', () => {
  it('returns property-scoped transfer history with the requested limit', async () => {
    const client = { requestScoped: true };
    const auditLog = {
      id: 'audit-1',
      hotel_id: hotelId,
      actor_user_id: ownerId,
      actor_email: owner.email,
      action: 'hotel_admin_transfer' as const,
      previous_admin_membership_id: ownerMembership.id,
      previous_admin_user_id: ownerId,
      new_admin_membership_id: membershipId,
      new_admin_user_id: staffId,
      details: { previousRole: 'hotel_owner', newRole: 'hotel_owner' },
      created_at: '2026-08-19T05:00:00.000Z',
    };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelAdminAuditLogs.mockResolvedValueOnce([auditLog]);
    const app = await caller();

    await expect(app.channelManager.listHotelAdminAuditLogs({
      hotel_id: hotelId,
      limit: 25,
    })).resolves.toEqual([auditLog]);
    expect(dbMocks.getManagedHotel).toHaveBeenCalledWith(client, hotelId);
    expect(dbMocks.listHotelAdminAuditLogs).toHaveBeenCalledWith(client, hotelId, 25);
  });

  it('rejects audit history outside the caller hotel scope', async () => {
    const app = await caller();

    await expect(app.channelManager.listHotelAdminAuditLogs({
      hotel_id: otherHotelId,
      limit: 25,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listHotelAdminAuditLogs).not.toHaveBeenCalled();
  });
});

describe('channelManager.inviteHotelStaff', () => {
  it('normalizes email, invites a new user, and assigns only a human hotel role', async () => {
    const client = { requestScoped: true };
    const invitedUser = { id: staffId, email: 'newstaff@example.com' };
    const membership = { ...staffMembership, role: 'housekeeping' as const };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    supabaseMocks.listAuthUsers.mockResolvedValueOnce([]);
    supabaseMocks.inviteAuthUser.mockResolvedValueOnce(invitedUser);
    dbMocks.createHotelUserAssignment.mockResolvedValueOnce(membership);
    const app = await caller();

    await expect(app.channelManager.inviteHotelStaff({
      hotel_id: hotelId,
      email: ' NewStaff@Example.COM ',
      role: 'housekeeping',
    })).resolves.toEqual({ user: invitedUser, membership, invitationSent: true });
    expect(supabaseMocks.inviteAuthUser).toHaveBeenCalledWith('newstaff@example.com');
    expect(dbMocks.createHotelUserAssignment).toHaveBeenCalledWith(client, {
      user_id: staffId,
      hotel_id: hotelId,
      role: 'housekeeping',
    });
  });

  it('rejects duplicate membership before inviting or inserting', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    const app = await caller();

    await expect(app.channelManager.inviteHotelStaff({
      hotel_id: hotelId,
      email: 'frontdesk@example.com',
      role: 'front_desk',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(supabaseMocks.inviteAuthUser).not.toHaveBeenCalled();
    expect(dbMocks.createHotelUserAssignment).not.toHaveBeenCalled();
  });

  it('rejects inviting a second Hotel Admin for the same hotel', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    supabaseMocks.listAuthUsers.mockResolvedValueOnce([]);
    const app = await caller();

    await expect(app.channelManager.inviteHotelStaff({
      hotel_id: hotelId,
      email: 'second-owner@example.com',
      role: 'hotel_owner',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(supabaseMocks.inviteAuthUser).not.toHaveBeenCalled();
    expect(dbMocks.createHotelUserAssignment).not.toHaveBeenCalled();
  });

  it('rejects api_service and super_admin roles at input validation', async () => {
    const app = await caller();

    await expect(app.channelManager.inviteHotelStaff({
      hotel_id: hotelId,
      email: 'service@example.com',
      role: 'api_service' as never,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(app.channelManager.inviteHotelStaff({
      hotel_id: hotelId,
      email: 'platform@example.com',
      role: 'super_admin',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('channelManager.updateHotelStaffRole', () => {
  it('updates a property staff role through the RLS helper', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    const updated = { ...staffMembership, role: 'revenue_manager' as const };
    dbMocks.updateHotelUserAssignmentRole.mockResolvedValueOnce(updated);
    const app = await caller();

    await expect(app.channelManager.updateHotelStaffRole({
      hotel_id: hotelId,
      membership_id: membershipId,
      role: 'revenue_manager',
    })).resolves.toEqual(updated);
    expect(dbMocks.updateHotelUserAssignmentRole).toHaveBeenCalledWith(client, {
      hotel_id: hotelId,
      membership_id: membershipId,
      role: 'revenue_manager',
    });
  });

  it('prevents demoting the last Hotel Admin', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership]);
    const app = await caller();

    await expect(app.channelManager.updateHotelStaffRole({
      hotel_id: hotelId,
      membership_id: ownerMembership.id,
      role: 'front_desk',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(dbMocks.updateHotelUserAssignmentRole).not.toHaveBeenCalled();
  });

  it('rejects promoting another member to Hotel Admin while one already exists', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    const app = await caller();

    await expect(app.channelManager.updateHotelStaffRole({
      hotel_id: hotelId,
      membership_id: membershipId,
      role: 'hotel_owner',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(dbMocks.updateHotelUserAssignmentRole).not.toHaveBeenCalled();
  });
});

describe('channelManager.transferHotelAdmin', () => {
  it('transfers ownership to another human staff member in the same hotel', async () => {
    const client = { requestScoped: true };
    const target = { ...staffMembership, role: 'hotel_owner' as const };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership, staffMembership]);
    dbMocks.transferHotelAdmin.mockResolvedValueOnce(target);
    const app = await caller();

    await expect(app.channelManager.transferHotelAdmin({
      hotel_id: hotelId,
      target_membership_id: membershipId,
    })).resolves.toEqual(target);
    expect(dbMocks.transferHotelAdmin).toHaveBeenCalledWith(client, {
      hotel_id: hotelId,
      target_membership_id: membershipId,
    });
  });

  it('rejects a target membership from another hotel before calling the transfer helper', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership]);
    const app = await caller();

    await expect(app.channelManager.transferHotelAdmin({
      hotel_id: hotelId,
      target_membership_id: 'f2c5a5d2-61f2-4c49-a1c1-4d7d9f9173f0',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(dbMocks.transferHotelAdmin).not.toHaveBeenCalled();
  });
});

describe('channelManager.removeHotelStaff', () => {
  it('removes a non-owner staff membership in the selected hotel', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    const app = await caller();

    await expect(app.channelManager.removeHotelStaff({ hotel_id: hotelId, membership_id: membershipId }))
      .resolves.toEqual({ success: true, id: membershipId });
    expect(dbMocks.deleteHotelUserAssignment).toHaveBeenCalledWith(client, membershipId);
  });

  it('prevents removing the current user or the last Hotel Admin', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership]);
    const app = await caller();

    await expect(app.channelManager.removeHotelStaff({ hotel_id: hotelId, membership_id: ownerMembership.id }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(dbMocks.deleteHotelUserAssignment).not.toHaveBeenCalled();
  });
});
