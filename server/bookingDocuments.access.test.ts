import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMembershipPermissions } from '@shared/permissions';

const repoMocks = vi.hoisted(() => ({
  getInvoiceSettings: vi.fn(),
  saveInvoiceSettings: vi.fn(),
  listBookingDocuments: vi.fn(),
  issueBookingDocument: vi.fn(),
}));

vi.mock('./d1/bookingDocuments', () => repoMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = 'b2c1d1a0-0000-4000-8000-000000000000';
const header = { hotel_id: HOME_HOTEL, enabled: true, issuer_name: 'Hotel', address: '1 Road', tax_id: '0105555555555', branch: null, phone: null };
const issue = { hotel_id: HOME_HOTEL, booking_id: 'b1', type: 'receipt' as const, buyer_name: 'Guest', buyer_address: null, buyer_tax_id: null, buyer_branch: null };

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'front_desk' | 'housekeeping') {
  const permissions = resolveMembershipPermissions(role, { grants: [] });
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322', email: 'user@example.com', name: 'Test user',
      accessToken: `${role}-access-token`, appMetadata: {}, userMetadata: {},
      role, roles: [role], memberships: [{ hotelId: HOME_HOTEL, role, permissions }],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('receipts and tax invoices follow hotel permissions', () => {
  it('lets the owner set the header and issue a document', async () => {
    const app = await caller('hotel_owner');
    await app.bookingDocuments.saveSettings(header);
    await app.bookingDocuments.issue(issue);
    expect(repoMocks.saveInvoiceSettings).toHaveBeenCalledTimes(1);
    expect(repoMocks.issueBookingDocument).toHaveBeenCalledTimes(1);
  });

  it('lets front desk issue documents but not change the header', async () => {
    const app = await caller('front_desk');
    await app.bookingDocuments.issue(issue);
    await expect(app.bookingDocuments.saveSettings(header)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repoMocks.saveInvoiceSettings).not.toHaveBeenCalled();
  });

  it('denies housekeeping issuing or listing documents', async () => {
    const app = await caller('housekeeping');
    await expect(app.bookingDocuments.issue(issue)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.bookingDocuments.list({ hotel_id: HOME_HOTEL, booking_id: 'b1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repoMocks.issueBookingDocument).not.toHaveBeenCalled();
  });

  it('denies another hotel and a bad tax ID before touching data', async () => {
    const app = await caller('hotel_owner');
    await expect(app.bookingDocuments.issue({ ...issue, hotel_id: OTHER_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.bookingDocuments.saveSettings({ ...header, tax_id: '12345' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repoMocks.issueBookingDocument).not.toHaveBeenCalled();
    expect(repoMocks.saveInvoiceSettings).not.toHaveBeenCalled();
  });
});
