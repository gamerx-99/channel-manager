import { beforeEach, describe, expect, it, vi } from 'vitest';

// The billing gate lives in server/db/booking.ts holdRoomType, the only place a
// public guest can create inventory. It must reject a lapsed subscription BEFORE
// any availability work, and must fail CLOSED when the billing tables are
// missing (pre-migration) so a deployment gap cannot open bookings for free.

const dbMocks = vi.hoisted(() => ({
  resolveHotelBillingState: vi.fn(),
}));

vi.mock('./subscriptionDb', () => dbMocks);
vi.mock('../db/availability', () => ({
  listRateOverridesForRoomType: vi.fn().mockResolvedValue([]),
  assertBookingMinStay: vi.fn(),
}));

import { holdRoomType } from '../db/booking';

const HOTEL = { id: 'hotel-1', name: 'Test Resort', slug: 'test-resort', address: 'Phuket' };

/** Minimal Supabase double: only the calls made before the billing gate. */
function createClient() {
  const calls: string[] = [];
  const rpc = vi.fn((name: string) => {
    calls.push(`rpc:${name}`);
    const result = name === 'get_public_hotel'
      ? Promise.resolve({ data: HOTEL, error: null })
      : Promise.resolve({ data: [], error: null });
    // holdRoomType awaits `.rpc(...).single()` for get_public_hotel.
    return Object.assign(result, {
      single: () => Promise.resolve({ data: name === 'get_public_hotel' ? HOTEL : null, error: null }),
    });
  });
  const from = vi.fn((table: string) => {
    calls.push(`from:${table}`);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }));
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
  return { client: { rpc, from } as any, calls };
}

describe('holdRoomType — SaaS billing gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ACTIVE = {
    subscription: { status: 'active' as const, periodEnd: '2999-01-01T00:00:00.000Z' },
    lifecycle: { suspendedAt: null, deletedAt: null },
    decision: { allowed: true as const, reason: 'active' as const },
  };

  it('rejects a hotel whose subscription lapsed, before touching inventory', async () => {
    dbMocks.resolveHotelBillingState.mockResolvedValueOnce({
      subscription: { status: 'past_due' as const, periodEnd: '2999-01-01T00:00:00.000Z' },
      lifecycle: { suspendedAt: null, deletedAt: null },
      decision: { allowed: false as const, reason: 'not_paying' as const },
    });
    const { client, calls } = createClient();

    await expect(
      holdRoomType(client, {
        slug: 'test-resort',
        room_type_id: 'rt-1',
        check_in: '2026-10-20',
        check_out: '2026-10-22',
        adults: 2,
        children: [],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Gate runs right after the hotel lookup: no rooms/bookings read happened.
    expect(calls).not.toContain('from:rooms');
    expect(calls).not.toContain('from:bookings');
  });

  it('rejects a hotel with no subscription row at all (fail closed)', async () => {
    dbMocks.resolveHotelBillingState.mockResolvedValueOnce({
      subscription: null,
      lifecycle: { suspendedAt: null, deletedAt: null },
      decision: { allowed: false as const, reason: 'no_subscription' as const },
    });
    const { client } = createClient();

    await expect(
      holdRoomType(client, {
        slug: 'test-resort',
        room_type_id: 'rt-1',
        check_in: '2026-10-20',
        check_out: '2026-10-22',
        adults: 2,
        children: [],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('rejects a suspended hotel even on an active plan', async () => {
    dbMocks.resolveHotelBillingState.mockResolvedValueOnce({
      subscription: ACTIVE.subscription,
      lifecycle: { suspendedAt: '2026-10-01T00:00:00.000Z', deletedAt: null },
      decision: { allowed: false as const, reason: 'suspended' as const },
    });
    const { client } = createClient();

    await expect(
      holdRoomType(client, {
        slug: 'test-resort',
        room_type_id: 'rt-1',
        check_in: '2026-10-20',
        check_out: '2026-10-22',
        adults: 2,
        children: [],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('checks billing exactly once per hold', async () => {
    dbMocks.resolveHotelBillingState.mockResolvedValue(ACTIVE);
    const { client } = createClient();

    // The happy path fails later on missing inventory; what matters here is
    // that the gate ran once and let the request proceed past it.
    await holdRoomType(client, {
      slug: 'test-resort',
      room_type_id: 'rt-1',
      check_in: '2026-10-20',
      check_out: '2026-10-22',
      adults: 2,
      children: [],
    }).catch(() => undefined);

    expect(dbMocks.resolveHotelBillingState).toHaveBeenCalledTimes(1);
    expect(dbMocks.resolveHotelBillingState).toHaveBeenCalledWith(client, 'hotel-1');
  });
});