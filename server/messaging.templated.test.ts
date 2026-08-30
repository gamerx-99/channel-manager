import { describe, expect, it, vi } from 'vitest';
import {
  getTemplatedMessageForBooking,
  buildPreArrivalReminderBody,
  triggerTemplatedPreArrivalMessages,
} from './messaging';

/**
 * T04-03 — templated pre-arrival trigger tests.
 * Pure helper getTemplatedMessageForBooking must be covered for:
 *  - fires for tomorrow
 *  - not for today / other dates
 *  - handles missing check_in
 *  - idempotency (same input → same output, no mutation)
 *  - gracefully handles missing tables (42P01) in trigger
 */

const TODAY = '2026-09-01';
const TOMORROW = '2026-09-02';

describe('getTemplatedMessageForBooking — fires for tomorrow', () => {
  it('returns reminder body when check_in is tomorrow', () => {
    const booking = { id: 'b1', check_in: TOMORROW, guest_name: 'Alice' };
    const body = getTemplatedMessageForBooking(booking, TODAY);
    expect(body).not.toBeNull();
    expect(body!).toContain('tomorrow');
    expect(body!).toContain(TOMORROW);
    expect(body!).toContain('Alice');
  });

  it('returns reminder body without guest name gracefully', () => {
    const booking = { id: 'b2', check_in: TOMORROW };
    const body = getTemplatedMessageForBooking(booking, TODAY);
    expect(body).not.toBeNull();
    expect(body!).toContain(TOMORROW);
    expect(body!).toContain('Hi,');
  });
});

describe('getTemplatedMessageForBooking — not for today / other dates', () => {
  it('returns null when check_in is today (not tomorrow)', () => {
    const booking = { check_in: TODAY, guest_name: 'Bob' };
    expect(getTemplatedMessageForBooking(booking, TODAY)).toBeNull();
  });

  it('returns null when check_in is yesterday', () => {
    const booking = { check_in: '2026-08-31', guest_name: 'Bob' };
    expect(getTemplatedMessageForBooking(booking, TODAY)).toBeNull();
  });

  it('returns null when check_in is day after tomorrow', () => {
    const booking = { check_in: '2026-09-03' };
    expect(getTemplatedMessageForBooking(booking, TODAY)).toBeNull();
  });

  it('returns null when check_in is far future', () => {
    const booking = { check_in: '2026-12-25' };
    expect(getTemplatedMessageForBooking(booking, TODAY)).toBeNull();
  });

  it('returns null when check_in is far past', () => {
    const booking = { check_in: '2025-01-01' };
    expect(getTemplatedMessageForBooking(booking, TODAY)).toBeNull();
  });
});

describe('getTemplatedMessageForBooking — handles missing / invalid check_in', () => {
  it('returns null when check_in is null', () => {
    expect(getTemplatedMessageForBooking({ check_in: null }, TODAY)).toBeNull();
  });

  it('returns null when check_in is undefined (missing field)', () => {
    expect(getTemplatedMessageForBooking({}, TODAY)).toBeNull();
    expect(getTemplatedMessageForBooking({ guest_name: 'Alice' } as any, TODAY)).toBeNull();
  });

  it('returns null when booking is null/undefined', () => {
    expect(getTemplatedMessageForBooking(null as any, TODAY)).toBeNull();
    expect(getTemplatedMessageForBooking(undefined as any, TODAY)).toBeNull();
  });

  it('returns null when check_in is empty string', () => {
    expect(getTemplatedMessageForBooking({ check_in: '' }, TODAY)).toBeNull();
  });

  it('returns null when check_in is not ISO date (invalid)', () => {
    expect(getTemplatedMessageForBooking({ check_in: 'not-a-date' }, TODAY)).toBeNull();
    expect(getTemplatedMessageForBooking({ check_in: '2026/09/02' }, TODAY)).toBeNull();
  });
});

describe('getTemplatedMessageForBooking — idempotency & purity', () => {
  it('is idempotent: same booking returns identical body on repeated calls', () => {
    const booking = { id: 'b3', check_in: TOMORROW, guest_name: 'Charlie' };
    const first = getTemplatedMessageForBooking(booking, TODAY);
    const second = getTemplatedMessageForBooking(booking, TODAY);
    expect(first).toBe(second);
    expect(first).not.toBeNull();
  });

  it('does not mutate the input booking', () => {
    const booking = { id: 'b4', check_in: TOMORROW, guest_name: ' Dana ' };
    const clone = { ...booking };
    getTemplatedMessageForBooking(booking, TODAY);
    expect(booking).toEqual(clone);
  });

  it('buildPreArrivalReminderBody is deterministic for same booking', () => {
    const booking = { check_in: TOMORROW, guest_name: 'Eve' };
    expect(buildPreArrivalReminderBody(booking)).toBe(buildPreArrivalReminderBody(booking));
  });
});

describe('triggerTemplatedPreArrivalMessages — missing tables grace (42P01)', () => {
  it('gracefully handles missing bookings table (42P01) — returns sent 0 without throwing', async () => {
    const client = {
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              // not used
              // but our trigger calls .eq('check_in', tomorrow) then maybe eq(hotelId)
              // For missing bookings, the select chain returns error with code 42P01
            }),
            // Simulate bookings select returning 42P01
            // The actual chain is: client.from('bookings').select(...).eq(...)[.eq(...)] returns { data, error }
            // We implement select().eq() that returns a Promise-like with error.
          }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    // More precise 42P01 mock: make from('bookings').select().eq() return { data:null, error: 42P01 }
    const errorClient = {
      from: (table: string) => {
        if (table === 'bookings') {
          return {
            select: () => ({
              eq: (_col: string, _val: string) => {
                const chain: any = {
                  eq: (_c: string, _v: string) => chain,
                };
                // Make the chain awaitable as { data, error }
                chain.then = undefined;
                // The trigger does `await query` where query is the chain; supabase returns { data, error } via await.
                // Our mock must make `await query` resolve to error object. We implement thenable:
                (chain as any).then = (resolve: (v: any) => void) =>
                  resolve({ data: null, error: { code: '42P01', message: 'relation \"bookings\" does not exist' } });
                // Also support direct await on eq result:
                return new Promise(resolve => resolve({ data: null, error: { code: '42P01', message: 'relation \"bookings\" does not exist' } })) as any;
              },
            }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) } as any;
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await triggerTemplatedPreArrivalMessages(errorClient, { todayIso: TODAY });
    expect(result.sent).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.tomorrow).toBe(TOMORROW);
  });

  it('gracefully handles missing message_threads/messages tables (42P01) during insert', async () => {
    const tomorrowBooking = { id: 'b-42', check_in: TOMORROW, guest_name: 'Grace', hotel_id: 'hotel-1' };

    const client = {
      from: (table: string) => {
        if (table === 'message_threads') {
          // idempotency check or thread creation — simulate 42P01
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: null, error: { code: '42P01', message: 'relation \"message_threads\" does not exist' } }),
                maybeSingle: async () => ({ data: null, error: { code: '42P01', message: 'relation \"message_threads\" does not exist' } }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { code: '42P01', message: 'relation \"message_threads\" does not exist' } }),
              }),
            }),
          } as any;
        }
        if (table === 'messages') {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
            insert: async () => ({ data: null, error: { code: '42P01', message: 'relation \"messages\" does not exist' } }),
          } as any;
        }
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
        } as any;
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await triggerTemplatedPreArrivalMessages(client, {
      todayIso: TODAY,
      bookings: [tomorrowBooking],
    });
    // Should not throw; should return gracefully with 0 sent (since tables missing)
    expect(result.tomorrow).toBe(TOMORROW);
    expect(result.sent).toBe(0);
    // Not counted as error — 42P01 is graceful short-circuit
    expect(result.errors).toBe(0);
  });

  it('sends only for tomorrow bookings when bookings are provided directly', async () => {
    const tomorrowBooking = { id: 'b-tomorrow', check_in: TOMORROW, guest_name: 'Hank', hotel_id: 'hotel-1' };
    const todayBooking = { id: 'b-today', check_in: TODAY, guest_name: 'Ivy', hotel_id: 'hotel-1' };
    const futureBooking = { id: 'b-future', check_in: '2026-09-10', guest_name: 'Jack', hotel_id: 'hotel-1' };

    let insertCalls = 0;
    const client = {
      from: (table: string) => {
        if (table === 'message_threads') {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'thread-1' }, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'messages') {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
            insert: async (payload: any) => {
              insertCalls += 1;
              expect(payload.body).toContain(TOMORROW);
              return { data: { id: 'msg-1' }, error: null };
            },
          } as any;
        }
        return { select: () => ({ eq: () => ({}) }) } as any;
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await triggerTemplatedPreArrivalMessages(client, {
      todayIso: TODAY,
      bookings: [tomorrowBooking, todayBooking, futureBooking],
    });
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(2);
    expect(insertCalls).toBe(1);
  });
});
