import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMembershipPermissions } from '@shared/permissions';

const reportMocks = vi.hoisted(() => ({ listBookingsReportData: vi.fn() }));
vi.mock('./d1/bookingsReport', () => reportMocks);
const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
beforeEach(() => vi.clearAllMocks());

async function caller(permissions: ReturnType<typeof resolveMembershipPermissions>, role: 'front_desk' | 'hotel_owner' = 'front_desk') {
  const { appRouter } = await import('./routers');
  return appRouter.createCaller({ req: {} as Request, res: {} as Response, user: {
    id: 'd93900a0-e7fe-45d6-9364-80ea8a035322', email: 'user@example.com', name: 'Test', accessToken: 'token', appMetadata: {}, userMetadata: {},
    role, roles: [role], memberships: [{ hotelId, role, permissions }],
  }, db: {} as any, caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any });
}

describe('bookings report permission', () => {
  it('refuses a user without reports.view_bookings before reading the repository', async () => {
    const app = await caller(resolveMembershipPermissions('front_desk', { revokes: ['reports.view_bookings'] }));
    await expect(app.channelManager.bookingsReport({ hotelId, basis: 'stay', period: { month: '2026-11' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(reportMocks.listBookingsReportData).not.toHaveBeenCalled();
  });
  it('allows an authorized hotel member', async () => {
    reportMocks.listBookingsReportData.mockResolvedValue({ bookings: [], sellableRooms: 2 });
    const app = await caller(resolveMembershipPermissions('front_desk'));
    await expect(app.channelManager.bookingsReport({ hotelId, basis: 'stay', period: { month: '2026-11' } })).resolves.toMatchObject({ totals: { bookings: 0 } });
    expect(reportMocks.listBookingsReportData).toHaveBeenCalledWith(expect.anything(), expect.anything(), hotelId);
  });
  it('sends no financial keys to front desk and sends them to the owner', async () => {
    reportMocks.listBookingsReportData.mockResolvedValue({ bookings: [{ id: '12345678-aaaa', guestName: 'Guest', roomType: 'Standard', checkIn: '2026-11-01', checkOut: '2026-11-04', createdAt: '2026-10-20T10:00:00Z', status: 'confirmed', source: 'manual', price: '3600', roomRevenue: '3000' }], sellableRooms: 2 });
    const frontDesk = await caller(resolveMembershipPermissions('front_desk'));
    const staffReport = await frontDesk.channelManager.bookingsReport({ hotelId, basis: 'stay', period: { month: '2026-11' } });
    expect(staffReport.totals).not.toHaveProperty('adr');
    expect(staffReport.roomTypes[0]).not.toHaveProperty('revenue');
    expect(staffReport.sources[0]).not.toHaveProperty('share');
    expect(staffReport.rows[0]).not.toHaveProperty('amount');
    expect(JSON.stringify(staffReport)).not.toMatch(/"(?:adr|revenue|share|amount)":/);
    const owner = await caller(resolveMembershipPermissions('hotel_owner'), 'hotel_owner');
    const ownerReport = await owner.channelManager.bookingsReport({ hotelId, basis: 'stay', period: { month: '2026-11' } });
    expect(ownerReport.totals.adr).toBe(1000);
    expect(ownerReport.roomTypes[0].revenue).toBe(3000);
    expect(ownerReport.rows[0].amount).toBe(3600);
  });
});
