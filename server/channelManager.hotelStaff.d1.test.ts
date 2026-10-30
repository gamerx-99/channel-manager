import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 10000 });

const staffMocks = vi.hoisted(() => ({
  listHotelUserAssignments: vi.fn(),
  listHotelStaff: vi.fn(),
  listHotelAdminAuditLogs: vi.fn(),
  createHotelUserAssignment: vi.fn(),
  deleteHotelUserAssignment: vi.fn(),
  updateHotelUserAssignmentRole: vi.fn(),
  transferHotelAdmin: vi.fn(),
}));

const inviteMocks = vi.hoisted(() => ({
  inviteStaffUser: vi.fn(),
  acceptStaffInvite: vi.fn(),
}));

const signupLinkMocks = vi.hoisted(() => ({
  createSignupLink: vi.fn(),
  listSignupLinksForHotel: vi.fn(),
  getValidSignupLink: vi.fn(),
  redeemSignupLink: vi.fn(),
  createHotelOwnerMembership: vi.fn(),
}));

vi.mock('./d1/staff', () => staffMocks);
vi.mock('./d1/invites', () => inviteMocks);
vi.mock('./d1/signupLinks', () => signupLinkMocks);

const { appRouter } = await import('./routers');

const HOTEL_ID = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL_ID = 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a';
const OWNER_ID = 'd93900a0-e7fe-45d6-9364-80ea8a035322';
const STAFF_ID = 'a5f0d7d7-7bc7-4aab-8dc6-1b2ee2ba17f3';
const MEMBERSHIP_ID = 'c5b0b6e1-6a11-4c90-bb12-3f9a4583df45';

const ownerMembership = {
  id: 'owner-membership',
  hotel_id: HOTEL_ID,
  user_id: OWNER_ID,
  role: 'hotel_owner' as const,
  created_at: '2026-08-19T00:00:00.000Z',
  hotels: { name: 'Little Bro' },
};

const staffMembership = {
  id: MEMBERSHIP_ID,
  hotel_id: HOTEL_ID,
  user_id: STAFF_ID,
  role: 'front_desk' as const,
  created_at: '2026-08-19T00:00:00.000Z',
  hotels: { name: 'Little Bro' },
};

function caller(role: 'hotel_owner' | 'revenue_manager' | 'front_desk', hotelId = HOTEL_ID) {
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: OWNER_ID,
      email: `${role}@example.com`,
      name: 'Staff test user',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: role === 'hotel_owner' ? [{ hotelId, role }] : [{ hotelId: HOTEL_ID, role }],
    },
    db: {} as any,
    caller: { userId: OWNER_ID, roles: [role], access: 'authenticated' } as any,
  });
}

beforeEach(() => {
  Object.values(staffMocks).forEach(mock => mock.mockReset());
  Object.values(inviteMocks).forEach(mock => mock.mockReset());
  Object.values(signupLinkMocks).forEach(mock => mock.mockReset());
  staffMocks.listHotelStaff.mockResolvedValue([staffMembership]);
  staffMocks.listHotelUserAssignments.mockResolvedValue([ownerMembership, staffMembership]);
  staffMocks.listHotelAdminAuditLogs.mockResolvedValue([]);
  staffMocks.updateHotelUserAssignmentRole.mockResolvedValue({ ...staffMembership, role: 'revenue_manager' });
  staffMocks.transferHotelAdmin.mockResolvedValue({ ...staffMembership, role: 'hotel_owner' });
  staffMocks.deleteHotelUserAssignment.mockResolvedValue({ id: MEMBERSHIP_ID });
  inviteMocks.inviteStaffUser.mockResolvedValue({
    user: { id: STAFF_ID, email: 'newstaff@example.com' },
    membership: staffMembership,
    invitationSent: true,
  });
});

describe.sequential('channelManager hotel staff (D1 router)', () => {

describe('channelManager.hotelStaff (D1 router)', () => {
  it('rejects a Hotel Admin from a hotel outside their membership scope', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.hotelStaff({ hotel_id: OTHER_HOTEL_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(staffMocks.listHotelStaff).not.toHaveBeenCalled();
  });

  it('lists only the selected hotel staff through the D1 helper', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.hotelStaff({ hotel_id: HOTEL_ID })).resolves.toEqual({
      hotel: { id: HOTEL_ID, name: '' },
      staff: [staffMembership],
    });
    expect(staffMocks.listHotelStaff).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      HOTEL_ID,
      [],
    );
  });
});

describe('channelManager.listHotelAdminAuditLogs (D1 router)', () => {
  it('returns property-scoped transfer history with the requested limit', async () => {
    const auditLog = {
      id: 'audit-1',
      hotel_id: HOTEL_ID,
      actor_user_id: OWNER_ID,
      actor_email: 'owner@example.com',
      action: 'hotel_admin_transfer' as const,
      previous_admin_membership_id: ownerMembership.id,
      previous_admin_user_id: OWNER_ID,
      new_admin_membership_id: MEMBERSHIP_ID,
      new_admin_user_id: STAFF_ID,
      details: { previousRole: 'hotel_owner', newRole: 'hotel_owner' },
      created_at: '2026-08-19T05:00:00.000Z',
    };
    staffMocks.listHotelAdminAuditLogs.mockResolvedValueOnce([auditLog]);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.listHotelAdminAuditLogs({ hotel_id: HOTEL_ID, limit: 25 }),
    ).resolves.toEqual([auditLog]);
    expect(staffMocks.listHotelAdminAuditLogs).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      HOTEL_ID,
      25,
    );
  });

  it('rejects audit history outside the caller hotel scope', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.listHotelAdminAuditLogs({ hotel_id: OTHER_HOTEL_ID, limit: 25 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(staffMocks.listHotelAdminAuditLogs).not.toHaveBeenCalled();
  });
});

describe('channelManager.inviteHotelStaff (D1 router)', () => {
  it('normalizes email and delegates to the D1 invite helper', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.inviteHotelStaff({
        hotel_id: HOTEL_ID,
        email: ' NewStaff@Example.COM ',
        role: 'housekeeping',
      }),
    ).resolves.toEqual({
      user: { id: STAFF_ID, email: 'newstaff@example.com' },
      membership: staffMembership,
      invitationSent: true,
    });

    expect(inviteMocks.inviteStaffUser).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      expect.any(Object),
      { hotel_id: HOTEL_ID, email: 'newstaff@example.com', role: 'housekeeping' },
    );
  });

  it('rejects a duplicate membership before inserting', async () => {
    inviteMocks.inviteStaffUser.mockRejectedValueOnce(
      new TRPCError({ code: 'CONFLICT', message: 'This user is already assigned to the selected hotel.' }),
    );
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.inviteHotelStaff({
        hotel_id: HOTEL_ID,
        email: 'frontdesk@example.com',
        role: 'front_desk',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects inviting a second Hotel Admin for the same hotel', async () => {
    inviteMocks.inviteStaffUser.mockRejectedValueOnce(
      new TRPCError({ code: 'CONFLICT', message: 'This hotel already has a Hotel Admin assigned.' }),
    );
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.inviteHotelStaff({
        hotel_id: HOTEL_ID,
        email: 'second-owner@example.com',
        role: 'hotel_owner',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects platform-only roles at input validation', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.inviteHotelStaff({
        hotel_id: HOTEL_ID,
        email: 'service@example.com',
        role: 'api_service' as never,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(
      app.channelManager.inviteHotelStaff({
        hotel_id: HOTEL_ID,
        email: 'platform@example.com',
        role: 'super_admin' as never,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('channelManager.updateHotelStaffRole (D1 router)', () => {
  it('updates a property staff role through the D1 helper', async () => {
    const updated = { ...staffMembership, role: 'revenue_manager' as const };
    staffMocks.updateHotelUserAssignmentRole.mockResolvedValueOnce(updated);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateHotelStaffRole({
        hotel_id: HOTEL_ID,
        membership_id: MEMBERSHIP_ID,
        role: 'revenue_manager',
      }),
    ).resolves.toEqual(updated);

    expect(staffMocks.updateHotelUserAssignmentRole).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      { hotel_id: HOTEL_ID, membership_id: MEMBERSHIP_ID, role: 'revenue_manager' },
    );
  });

  it('prevents demoting the last Hotel Admin', async () => {
    staffMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership]);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.updateHotelStaffRole({
        hotel_id: HOTEL_ID,
        membership_id: ownerMembership.id,
        role: 'front_desk',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(staffMocks.updateHotelUserAssignmentRole).not.toHaveBeenCalled();
  });
});

describe('channelManager.transferHotelAdmin (D1 router)', () => {
  it('transfers ownership to another human staff member in the same hotel', async () => {
    const target = { ...staffMembership, role: 'hotel_owner' as const };
    staffMocks.transferHotelAdmin.mockResolvedValueOnce(target);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.transferHotelAdmin({
        hotel_id: HOTEL_ID,
        target_membership_id: MEMBERSHIP_ID,
      }),
    ).resolves.toEqual(target);

    expect(staffMocks.transferHotelAdmin).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      { hotel_id: HOTEL_ID, target_membership_id: MEMBERSHIP_ID },
    );
  });

  it('rejects a target membership from another hotel before calling the transfer helper', async () => {
    staffMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership, staffMembership]);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.transferHotelAdmin({
        hotel_id: HOTEL_ID,
        target_membership_id: 'f2c5a5d2-61f2-4c49-a1c1-4d7d9f9173f0',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(staffMocks.transferHotelAdmin).not.toHaveBeenCalled();
  });
});

describe('channelManager.removeHotelStaff (D1 router)', () => {
  it('removes a non-owner staff membership in the selected hotel', async () => {
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.removeHotelStaff({ hotel_id: HOTEL_ID, membership_id: MEMBERSHIP_ID }),
    ).resolves.toEqual({ success: true, id: MEMBERSHIP_ID });
    expect(staffMocks.deleteHotelUserAssignment).toHaveBeenCalledWith(
      {},
      { userId: OWNER_ID, roles: ['hotel_owner'], access: 'authenticated' },
      MEMBERSHIP_ID,
    );
  });

  it('prevents removing the current user or the last Hotel Admin', async () => {
    staffMocks.listHotelUserAssignments.mockResolvedValueOnce([ownerMembership]);
    const app = await caller('hotel_owner');

    await expect(
      app.channelManager.removeHotelStaff({ hotel_id: HOTEL_ID, membership_id: ownerMembership.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(staffMocks.deleteHotelUserAssignment).not.toHaveBeenCalled();
  });
});

});
