import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('hotel settings pages', () => {
  const app = read('client/src/App.tsx');
  const general = read('client/src/components/hotel/HotelGeneralOperations.tsx');
  const finance = read('client/src/pages/HotelFinanceSettings.tsx');
  const profile = read('client/src/pages/HotelProfile.tsx');
  const sidebar = read('client/src/components/layout/Sidebar.tsx');
  const scope = read('client/src/lib/routeScope.ts');

  it('opens general, finance, and staff settings under the hotel settings menu', () => {
    expect(app).toContain('path="/hotels/:id/settings/general"');
    expect(app).toContain('path="/hotels/:id/settings/finance"');
    expect(app).toContain('path="/hotels/:id/staff"');
    expect(sidebar).toContain('sidebar.generalSettings');
    expect(sidebar).toContain('sidebar.financeSettings');
    expect(sidebar).toContain('sidebar.hotelStaff');
    expect(scope).toContain('settings\\/(?:general|finance)');
  });

  it('keeps hotel profile, expiry, public visibility, transfer, and closure in general settings', () => {
    expect(profile).toContain('<HotelGeneralOperations hotel={hotelQuery.data} />');
    expect(general).toContain('saveBookingRequestTimeout.useMutation');
    expect(general).toContain('booking_request_timeout_hours: value');
    expect(general).toContain('setHotelPublished.useMutation');
    expect(general).toContain('<HotelDataTransfer');
    expect(general).toContain('<HotelClosureSettings');
  });

  it('groups PromptPay, SlipOK, invoices, and the plan under finance settings', () => {
    expect(finance).toContain("'property.manage_profile'");
    expect(finance).toContain('<HotelPaymentSettings');
    expect(finance).toContain('<HotelInvoiceSettings');
    expect(finance).toContain('home-plan-card');
    expect(read('client/src/components/hotel/HotelPaymentSettings.tsx')).toContain('<SlipOkSettings');
  });
});
