import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// We test the domain helpers in server/housekeeping.ts directly with a mocked Supabase client.
// Also lightly test server/db.ts createHousekeepingTask to ensure 42P01 handling is duplicated there.

import {
  createHousekeepingTask,
  updateHousekeepingTask,
  listHousekeepingTasks,
  assertAssigneeIsHotelMember,
  resolveHousekeepingDueDate,
} from './housekeeping';

function makeClient(overrides: Record<string, unknown>) {
  // overrides is a map: table -> handler for `from`
  // For simplicity, we implement a chainable mock that captures calls.
  const calls: unknown[] = [];
  const client: Record<string, unknown> = {
    __calls: calls,
  };
  (client as { from: (table: string) => unknown }).from = (table: string) => {
    const handler = overrides[table] as { maybeSingle?: () => Promise<{ data: unknown; error: unknown }>; single?: () => Promise<{ data: unknown; error: unknown }>; selectChain?: unknown } | undefined;
    // For tables where we just want to record insert payload
    // We return a chainable object that supports .select, .eq, .insert, .update, .order etc.
    // We'll implement minimal chain that satisfies the code paths.

    // Create a chain object
    let insertPayload: unknown = null;
    let updatePayload: unknown = null;
    let eqFilters: Record<string, unknown> = {};
    const chain: Record<string, (...args: unknown[]) => unknown> = {
      select: (..._args: unknown[]) => chain,
      eq: (col: string, val: unknown) => {
        eqFilters[col] = val;
        return chain;
      },
      order: () => chain,
      insert: (payload: unknown) => {
        insertPayload = payload;
        (calls as unknown[]).push({ table, op: 'insert', payload, eqFilters: { ...eqFilters } });
        return chain;
      },
      update: (payload: unknown) => {
        updatePayload = payload;
        (calls as unknown[]).push({ table, op: 'update', payload, eqFilters: { ...eqFilters } });
        return chain;
      },
      maybeSingle: async () => {
        if (handler && typeof (handler as { maybeSingle?: () => Promise<{ data: unknown; error: unknown }> }).maybeSingle === 'function') {
          return (handler as { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }).maybeSingle();
        }
        // Default: return null for maybeSingle
        return { data: null, error: null };
      },
      single: async () => {
        if (handler && typeof (handler as { single?: () => Promise<{ data: unknown; error: unknown }> }).single === 'function') {
          // For insert single, we need to capture payload for due_date checks
          const res = await (handler as { single: () => Promise<{ data: unknown; error: unknown }> }).single();
          // If handler returns data containing the payload's due_date, tests can assert via captured calls
          return res;
        }
        return { data: null, error: null };
      },
    };
    // Expose internal for assertions
    (chain as unknown as { _insertPayload: unknown })._insertPayload = insertPayload;
    (chain as unknown as { _eq: Record<string, unknown> })._eq = eqFilters;

    // Store table for lookup if needed
    (chain as unknown as { _table: string })._table = table;

    return chain;
  };
  return client as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('housekeeping assign validation and due_date defaults', () => {
  const ROOM_ID = '11111111-1111-4111-8111-111111111111';
  const HOTEL_ID = '22222222-2222-4222-8222-222222222222';
  const MEMBER_USER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const NON_MEMBER_USER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
  const CHECK_OUT = '2026-09-15';

  it('valid assign success (create with member assignee)', async () => {
    let capturedInsert: Record<string, unknown> | null = null;
    const client = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: { id: 'membership-1' }, error: null }),
      },
      bookings: {
        maybeSingle: async () => ({ data: { check_out: CHECK_OUT }, error: null }),
      },
      housekeeping_tasks: {
        single: async () => {
          // Simulate insert success; we capture via closure
          return {
            data: {
              id: 'task-1',
              room_id: ROOM_ID,
              booking_id: null,
              assigned_to: MEMBER_USER,
              due_date: '2026-09-20',
              status: 'pending',
              created_at: new Date().toISOString(),
            },
            error: null,
          };
        },
      },
    });

    // Intercept insert payload by wrapping from for housekeeping_tasks
    const originalFrom = (client as unknown as { from: (t: string) => unknown }).from;
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const chain = originalFrom(table) as Record<string, (...a: unknown[]) => unknown>;
      if (table === 'housekeeping_tasks') {
        const origInsert = chain.insert as (p: unknown) => unknown;
        chain.insert = (payload: unknown) => {
          capturedInsert = payload as Record<string, unknown>;
          return origInsert(payload);
        };
      }
      return chain;
    };

    const task = await createHousekeepingTask(client, {
      room_id: ROOM_ID,
      assigned_to: MEMBER_USER,
      due_date: '2026-09-20',
      status: 'pending',
    });
    expect(task.assigned_to).toBe(MEMBER_USER);
    expect(task.due_date).toBe('2026-09-20');
    expect(capturedInsert).not.toBeNull();
  });

  it('non-member assign -> BAD_REQUEST naming invalid assignee (create)', async () => {
    const client = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: null, error: null }),
      },
    });
    await expect(
      createHousekeepingTask(client, {
        room_id: ROOM_ID,
        assigned_to: NON_MEMBER_USER,
        due_date: '2026-09-20',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining(NON_MEMBER_USER) });

    // also test update path
    const client2 = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: null, error: null }),
      },
    });
    await expect(
      updateHousekeepingTask(client2, 'task-id-1', {
        room_id: ROOM_ID,
        assigned_to: NON_MEMBER_USER,
        due_date: '2026-09-20',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining(NON_MEMBER_USER) });
  });

  it('booking-linked without due_date defaults correctly from booking.check_out', async () => {
    let capturedDueDate: string | null = null;
    const client = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: { id: 'm1' }, error: null }),
      },
      bookings: {
        maybeSingle: async () => ({ data: { check_out: CHECK_OUT }, error: null }),
      },
      housekeeping_tasks: {
        single: async () => ({
          data: {
            id: 'task-2',
            room_id: ROOM_ID,
            booking_id: BOOKING_ID,
            assigned_to: MEMBER_USER,
            due_date: CHECK_OUT,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      },
    });

    const originalFrom = (client as unknown as { from: (t: string) => unknown }).from;
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const chain = originalFrom(table) as Record<string, (...a: unknown[]) => unknown>;
      if (table === 'housekeeping_tasks') {
        const origInsert = chain.insert as (p: unknown) => unknown;
        chain.insert = (payload: unknown) => {
          capturedDueDate = (payload as Record<string, unknown>).due_date as string;
          return origInsert(payload);
        };
      }
      return chain;
    };

    const task = await createHousekeepingTask(client, {
      room_id: ROOM_ID,
      booking_id: BOOKING_ID,
      assigned_to: MEMBER_USER,
      due_date: null,
    });
    expect(capturedDueDate).toBe(CHECK_OUT);
    expect(task.due_date).toBe(CHECK_OUT);

    // Also test resolveHousekeepingDueDate directly
    const client2 = makeClient({
      bookings: {
        maybeSingle: async () => ({ data: { check_out: CHECK_OUT }, error: null }),
      },
    });
    const resolved = await resolveHousekeepingDueDate(client2, BOOKING_ID, null);
    expect(resolved).toBe(CHECK_OUT);
  });

  it('explicit due_date not overridden when booking_id also provided', async () => {
    let capturedDueDate: string | null = null;
    const explicit = '2026-10-01';
    const client = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: { id: 'm1' }, error: null }),
      },
      // bookings should NOT be called if explicit due_date provided; we make it throw if called
      bookings: {
        maybeSingle: async () => {
          throw new Error('bookings lookup should not be called when due_date is explicit');
        },
      },
      housekeeping_tasks: {
        single: async () => ({
          data: {
            id: 'task-3',
            room_id: ROOM_ID,
            booking_id: BOOKING_ID,
            assigned_to: MEMBER_USER,
            due_date: explicit,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      },
    });

    const originalFrom = (client as unknown as { from: (t: string) => unknown }).from;
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const chain = originalFrom(table) as Record<string, (...a: unknown[]) => unknown>;
      if (table === 'housekeeping_tasks') {
        const origInsert = chain.insert as (p: unknown) => unknown;
        chain.insert = (payload: unknown) => {
          capturedDueDate = (payload as Record<string, unknown>).due_date as string;
          return origInsert(payload);
        };
      }
      return chain;
    };

    const task = await createHousekeepingTask(client, {
      room_id: ROOM_ID,
      booking_id: BOOKING_ID,
      assigned_to: MEMBER_USER,
      due_date: explicit,
    });
    expect(capturedDueDate).toBe(explicit);
    expect(task.due_date).toBe(explicit);

    const client2 = makeClient({
      bookings: {
        maybeSingle: async () => ({ data: { check_out: CHECK_OUT }, error: null }),
      },
    });
    const resolved = await resolveHousekeepingDueDate(client2, BOOKING_ID, explicit);
    expect(resolved).toBe(explicit);
  });

  it('gracefully handles missing housekeeping_tasks table (42P01) for list and create', async () => {
    const clientList = makeClient({
      housekeeping_tasks: {
        // list uses maybeSingle/single? For list, we use .select + .eq + .order, but our mock only handles maybeSingle/single.
        // To simulate 42P01 for list, we make the chain's select throw via error in maybeSingleish?
        // Our makeClient's list path uses .eq chain ending without maybeSingle; but housekeeping.ts list uses a try/catch around `await client.from(...).select(...).eq(...).order(...)` which in supabase returns { data, error } directly, not maybeSingle.
        // We need to handle that: our mock's chain returns an object with error via data/error after order()
        // Simplify: we test db.ts listHousekeepingTasks directly with a minimal mock that returns error code 42P01
      },
    });

    // Directly test listHousekeepingTasks graceful 42P01 via a custom client that returns error with code 42P01
    const errorClient = {
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { code: '42P01', message: 'relation \"housekeeping_tasks\" does not exist' } }),
          }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const list = await listHousekeepingTasks(errorClient, HOTEL_ID);
    expect(list).toEqual([]);

    // Create with missing table should still succeed via synthetic return
    const createClient = {
      from: (table: string) => {
        if (table === 'rooms') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }) }) }),
          };
        }
        if (table === 'hotel_users') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'm1' }, error: null }) }) }) }),
          };
        }
        if (table === 'housekeeping_tasks') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { code: '42P01', message: 'relation \"housekeeping_tasks\" does not exist' } }),
              }),
            }),
          };
        }
        // bookings not needed
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const task = await createHousekeepingTask(createClient, {
      room_id: ROOM_ID,
      assigned_to: MEMBER_USER,
      due_date: '2026-09-20',
    });
    expect(task.id).toBe('00000000-0000-4000-a000-000000000000');
    expect(task.due_date).toBe('2026-09-20');
  });

  it('assertAssigneeIsHotelMember throws BAD_REQUEST naming invalid assignee via rooms->hotel_users', async () => {
    const client = makeClient({
      rooms: {
        maybeSingle: async () => ({ data: { hotel_id: HOTEL_ID }, error: null }),
      },
      hotel_users: {
        maybeSingle: async () => ({ data: null, error: null }),
      },
    });
    await expect(assertAssigneeIsHotelMember(client, ROOM_ID, NON_MEMBER_USER)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining(NON_MEMBER_USER),
    });
  });
});
