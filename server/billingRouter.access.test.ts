import { beforeEach, describe, expect, it, vi } from 'vitest';

// Permission boundary test for the SaaS billing router. A tenant must be able
// to read its own subscription and buy a plan, and must NOT be able to mark a
// payment as received, start trials, list other hotels' subscriptions, or
// suspend/soft-delete a tenant. Mirrors server/financials.access.test.ts.

const dbMocks = vi.hoisted(() => ({
  listPlans: vi.fn(),
  getLiveSubscription: vi.fn(),
  getLiveSubscriptionRow: vi.fn(),
  getHotelLifecycle: vi.fn(),
  countHotelRooms: vi.fn(),
  resolveHotelBillingState: vi.fn(),
  priceCheckout: vi.fn(),
  activateSubscription: vi.fn(),
  renewSubscription: vi.fn(),
  setHotelSuspended: vi.fn(),
  softDeleteHotel: vi.fn(),
  startTrial: vi.fn(),
}));

vi.mock('./billing/subscriptionDb', () => ({
  listPlans: dbMocks.listPlans,
  getLiveSubscription: dbMocks.getLiveSubscription,
  getLiveSubscriptionRow: dbMocks.getLiveSubscriptionRow,
  getHotelLifecycle: dbMocks.getHotelLifecycle,
  countHotelRooms: dbMocks.countHotelRooms,
  resolveHotelBillingState: dbMocks.resolveHotelBillingState,
}));

vi.mock('./billing/checkout', () => ({
  priceCheckout: dbMocks.priceCheckout,
  activateSubscription: dbMocks.activateSubscription,
  renewSubscription: dbMocks.renewSubscription,
  setHotelSuspended: dbMocks.setHotelSuspended,
  softDeleteHotel: dbMocks.softDeleteHotel,
  startTrial: dbMocks.startTrial,
  buildPaymentReference: (hotelId: string) => `SUB-${hotelId.slice(0, 8)}`,
}));

vi.mock('./supabase', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) })),
  })),
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

// requireSuperAdmin resolves identity through the DB, not the session payload.
const authMocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock('./db/auth', () => authMocks);

const HOTEL = '11111111-1111-4111-8111-111111111111';
const OTHER_HOTEL = '22222222-2222-4222-8222-222222222222';

const owner = {
  id: 'owner-1',
  roles: ['hotel_owner' as const],
  memberships: [{ hotelId: HOTEL, role: 'hotel_owner' as const }],
};

const superAdmin = {
  id: 'admin-1',
  roles: ['super_admin' as const],
  memberships: [],
};

/** Session roles are one signal; requireSuperAdmin asks the DB too. */
function dbSaysSuperAdmin(value: boolean) {
  authMocks.isSuperAdmin.mockResolvedValue(value);
}

function caller(user: unknown) {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: { ip: '127.0.0.1', socket: {} } as never,
    res: {} as never,
    user: user
      ? { email: 'u@example.com', name: 'U', accessToken: 'token', appMetadata: {}, userMetadata: {}, ...(user as object) }
      : null,
  } as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getHotelLifecycle.mockResolvedValue({ suspended_at: null, deleted_at: null });
  dbMocks.countHotelRooms.mockResolvedValue(5);
  dbMocks.getLiveSubscription.mockResolvedValue({
    status: 'active',
    periodEnd: '2999-01-01T00:00:00.000Z',
    planCode: 'starter',
  });
  dbSaysSuperAdmin(false);
  // The platform PromptPay ID is deployment config, not per-test state.
  process.env.PLATFORM_PROMPTPAY_ID = '0812345678';
  dbMocks.priceCheckout.mockResolvedValue({
    plan_code: 'starter',
    billing_cycle: 'monthly',
    amount: 990,
    tier_rooms: 5,
    period_end: '2026-07-15T00:00:00.000Z',
    reference: 'SUB-111111111111',
  });
});

describe('billing router — tenant read access', () => {
  it('lets a hotel owner read its own subscription state', async () => {
    const result = await (await caller(owner)).billing.mySubscription({ hotel_id: HOTEL });
    expect(result.room_count).toBe(5);
    expect(result.recommended_plan).toBe('starter');
    expect(result.decision.allowed).toBe(true);
  });

  it('refuses to read another hotel\'s subscription', async () => {
    await expect((await caller(owner)).billing.mySubscription({ hotel_id: OTHER_HOTEL }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exposes the plan ladder without authentication', async () => {
    dbMocks.listPlans.mockResolvedValue([]);
    const plans = await (await caller(null)).billing.plans();
    expect(plans).toHaveLength(3);
  });
});

describe('billing router — tenant write access', () => {
  it('lets an owner price a checkout for their own hotel', async () => {
    const result = await (await caller(owner)).billing.createCheckout({
      hotel_id: HOTEL,
      plan_code: 'starter',
      billing_cycle: 'monthly',
    });
    expect(result.amount).toBe(990);
    expect(dbMocks.priceCheckout).toHaveBeenCalledWith(
      expect.anything(),
      { hotelId: HOTEL, planCode: 'starter', billingCycle: 'monthly' },
    );
  });

  it('refuses checkout pricing for another hotel', async () => {
    await expect((await caller(owner)).billing.createCheckout({
      hotel_id: OTHER_HOTEL,
      plan_code: 'starter',
      billing_cycle: 'monthly',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.priceCheckout).not.toHaveBeenCalled();
  });
});

describe('billing router — platform-only operations', () => {
  it('stops an owner from confirming their own payment', async () => {
    await expect((await caller(owner)).billing.confirmPayment({
      hotel_id: HOTEL,
      plan_code: 'starter',
      billing_cycle: 'monthly',
      reference: 'PP-1',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.activateSubscription).not.toHaveBeenCalled();
    expect(dbMocks.renewSubscription).not.toHaveBeenCalled();
  });

  it('stops an owner from opening a trial', async () => {
    await expect((await caller(owner)).billing.startTrial({ hotel_id: HOTEL }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.startTrial).not.toHaveBeenCalled();
  });

  it('stops an owner from listing all subscriptions', async () => {
    await expect((await caller(owner)).billing.listAll())
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('stops an owner from suspending a tenant', async () => {
    await expect((await caller(owner)).billing.setSuspended({ hotel_id: HOTEL, suspended: true }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.setHotelSuspended).not.toHaveBeenCalled();
  });

  it('stops an owner from soft-deleting a tenant', async () => {
    await expect((await caller(owner)).billing.softDelete({ hotel_id: HOTEL }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.softDeleteHotel).not.toHaveBeenCalled();
  });

  it('allows a super_admin through the platform gates', async () => {
    dbSaysSuperAdmin(true);
    dbMocks.setHotelSuspended.mockResolvedValue(undefined);
    await expect((await caller(superAdmin)).billing.setSuspended({ hotel_id: HOTEL, suspended: true }))
      .resolves.toMatchObject({ success: true });
  });
});