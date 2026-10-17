import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// String-contract test: the landing + signup routes must stay registered and
// the billing gate must stay wired into the guest booking path. Matches the
// pattern of client/src/pages/Financials.contract.test.ts.

const root = path.resolve(__dirname, '..', '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

describe('SaaS shell contract', () => {
  it('registers the landing and signup routes in App.tsx', () => {
    const app = read('client/src/App.tsx');
    expect(app).toContain('import Landing from "./pages/Landing"');
    expect(app).toContain('import Signup from "./pages/Signup"');
    expect(app).toContain('path="/signup"');
    expect(app).toContain('path="/" component={Landing}');
  });

  it('no longer sends "/" to the dashboard', () => {
    const app = read('client/src/App.tsx');
    expect(app).not.toContain('RedirectToDashboard');
  });

  it('mounts billing and signup on the real tRPC router', () => {
    const routers = read('server/routers.ts');
    expect(routers).toContain('billing: billingRouter');
    expect(routers).toContain('signup: signupRouter');
  });

  it('gates the public hold path on the subscription decision', () => {
    const booking = read('server/db/booking.ts');
    expect(booking).toContain('resolveHotelBillingState');
    // The gate must sit in holdRoomType, not only in a helper nobody calls.
    const holdStart = booking.indexOf('export async function holdRoomType');
    const gateIndex = booking.indexOf('resolveHotelBillingState', holdStart);
    expect(gateIndex).toBeGreaterThan(holdStart);
  });

  it('fails closed when billing tables are missing', () => {
    // getLiveSubscription returns null on a missing table, and
    // subscriptionDecision treats null as "no_subscription" -> blocked.
    const db = read('server/billing/subscriptionDb.ts');
    expect(db).toContain('isMissingTableError');
    expect(db).toContain('return null');
    const access = read('shared/billing/subscriptionAccess.ts');
    expect(access).toContain("reason: 'no_subscription'");
  });

  it('keeps existing-data access open for statutory reporting', () => {
    const access = read('shared/billing/subscriptionAccess.ts');
    expect(access).toContain('canAccessExistingData');
    // must NOT gate historical reads on payment status
    const fn = access.slice(access.indexOf('export function canAccessExistingData'));
    expect(fn.slice(0, 400)).not.toContain('status');
  });

  it('surfaces billing state to the public page instead of failing it', () => {
    const types = read('server/db/types.ts');
    expect(types).toContain('accepts_new_bookings');
    const publicPage = read('client/src/pages/PublicHotel.tsx');
    expect(publicPage).toContain('billingBlock');
  });

  it('has Thai copy for every landing and signup string', () => {
    const en = read('client/src/lib/i18n/en.ts');
    const th = read('client/src/lib/i18n/th.ts');
    const keys = ['startTrial', 'heroHeadline', 'pricingHeading', 'faqCostQ', 'create', 'hotelName'];
    for (const key of keys) {
      expect(en, `en missing ${key}`).toContain(key);
      expect(th, `th missing ${key}`).toContain(key);
    }
  });
});