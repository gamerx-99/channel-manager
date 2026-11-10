import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMembershipPermissions } from '@shared/permissions';

const repoMocks = vi.hoisted(() => ({
  getInvoiceSettings: vi.fn(),
  saveInvoiceSettings: vi.fn(),
  listBookingDocuments: vi.fn(),
  listHotelDocuments: vi.fn(),
  issueBookingDocument: vi.fn(),
  getBookingDocument: vi.fn(),
}));

vi.mock('./d1/bookingDocuments', () => repoMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = 'b2c1d1a0-0000-4000-8000-000000000000';
const header = { hotel_id: HOME_HOTEL, enabled: true, issuer_name: 'Hotel', address: '1 Road', tax_id: '0105555555555', branch: null, phone: null, vat_enabled: false, vat_rate: 7, withholding_enabled: false, withholding_rate: 3 };
const issue = { hotel_id: HOME_HOTEL, booking_id: 'b1', type: 'receipt' as const, buyer_name: 'Guest', buyer_address: null, buyer_tax_id: null, buyer_branch: null };

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'hotel_owner' | 'front_desk' | 'housekeeping', candidateEnabled = true) {
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
    billingEnv: candidateEnabled ? { BILLING_CANDIDATE_ENABLED: 'true' } : undefined,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
  }));
}

describe('receipts and tax invoices follow hotel permissions', () => {
  it('blocks every document procedure before repository access when the candidate is off', async () => {
    const app = await caller('hotel_owner', false);
    const calls = [
      app.bookingDocuments.settings({ hotel_id: HOME_HOTEL }),
      app.bookingDocuments.saveSettings(header),
      app.bookingDocuments.list({ hotel_id: HOME_HOTEL, booking_id: 'b1' }),
      app.bookingDocuments.listHotel({ hotel_id: HOME_HOTEL }),
      app.bookingDocuments.issue(issue),
      app.bookingDocuments.getPdf({ hotel_id: HOME_HOTEL, document_id: 'doc-1' }),
      app.bookingDocuments.emailDocument({ hotel_id: HOME_HOTEL, document_id: 'doc-1', recipient_email: 'guest@example.test' }),
    ];
    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'Billing Candidate is inactive.' });
    }
    expect(repoMocks.getInvoiceSettings).not.toHaveBeenCalled();
    expect(repoMocks.saveInvoiceSettings).not.toHaveBeenCalled();
    expect(repoMocks.listBookingDocuments).not.toHaveBeenCalled();
    expect(repoMocks.listHotelDocuments).not.toHaveBeenCalled();
    expect(repoMocks.issueBookingDocument).not.toHaveBeenCalled();
    expect(repoMocks.getBookingDocument).not.toHaveBeenCalled();
  });

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
    await expect(app.bookingDocuments.listHotel({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repoMocks.issueBookingDocument).not.toHaveBeenCalled();
    expect(repoMocks.listHotelDocuments).not.toHaveBeenCalled();
  });

  it('denies another hotel and a bad tax ID before touching data', async () => {
    const app = await caller('hotel_owner');
    await expect(app.bookingDocuments.issue({ ...issue, hotel_id: OTHER_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.bookingDocuments.listHotel({ hotel_id: OTHER_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.bookingDocuments.saveSettings({ ...header, tax_id: '12345' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repoMocks.issueBookingDocument).not.toHaveBeenCalled();
    expect(repoMocks.listHotelDocuments).not.toHaveBeenCalled();
    expect(repoMocks.saveInvoiceSettings).not.toHaveBeenCalled();
  });

  it('allows owner and front desk to view hotel documents', async () => {
    const appOwner = await caller('hotel_owner');
    await appOwner.bookingDocuments.listHotel({ hotel_id: HOME_HOTEL });
    expect(repoMocks.listHotelDocuments).toHaveBeenCalledTimes(1);

    const appFrontDesk = await caller('front_desk');
    await appFrontDesk.bookingDocuments.listHotel({ hotel_id: HOME_HOTEL });
    expect(repoMocks.listHotelDocuments).toHaveBeenCalledTimes(2);
  });

  it('allows owner to get PDF and email document, but denies housekeeping', async () => {
    repoMocks.getBookingDocument.mockResolvedValue({
      id: 'doc-1',
      hotelId: HOME_HOTEL,
      snapshot: {
        type: 'invoice',
        number: 'INV-000001',
        issuedOn: '2026-11-10',
        issuer: { name: 'Hotel', address: 'Addr', taxId: null, branch: null, phone: null },
        buyer: { name: 'Guest', address: null, taxId: null, branch: null },
        booking: { id: 'b1', checkIn: '2026-12-01', checkOut: '2026-12-02', nights: 1, roomType: 'Deluxe' },
        items: [],
        subtotalSatang: 10000,
        vatEnabled: false,
        vatRate: 7,
        vatSatang: 0,
        withholdingEnabled: false,
        withholdingRate: 3,
        withholdingSatang: 0,
        totalSatang: 10000,
        netToPaySatang: 10000,
        amountPaidSatang: 0,
        balanceSatang: 10000,
        paymentStatus: 'unpaid',
      },
    });

    const appOwner = await caller('hotel_owner');
    const pdfRes = await appOwner.bookingDocuments.getPdf({ hotel_id: HOME_HOTEL, document_id: 'doc-1' });
    expect(pdfRes.filename).toContain('INV-000001');
    expect(pdfRes.contentType).toBe('application/pdf');

    const emailRes = await appOwner.bookingDocuments.emailDocument({
      hotel_id: HOME_HOTEL,
      document_id: 'doc-1',
      recipient_email: 'guest@example.test',
    });
    expect(emailRes.success).toBe(true);

    const appHousekeeping = await caller('housekeeping');
    await expect(appHousekeeping.bookingDocuments.getPdf({ hotel_id: HOME_HOTEL, document_id: 'doc-1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(appHousekeeping.bookingDocuments.emailDocument({
      hotel_id: HOME_HOTEL,
      document_id: 'doc-1',
      recipient_email: 'guest@example.test',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
