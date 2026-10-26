import { describe, expect, it, vi } from 'vitest';

const syncMocks = vi.hoisted(() => ({ syncOtaConnection: vi.fn() }));
vi.mock('./otaSync', () => syncMocks);
vi.mock('./supabase', () => ({ createSupabaseAdminClient: vi.fn() }));

import { isAuthorizedCronRequest, runScheduledOtaSync } from './otaScheduler';

const SECRET = 'a-very-long-cron-secret-value';

describe('isAuthorizedCronRequest', () => {
  it('accepts only the exact bearer secret', () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(undefined, SECRET)).toBe(false);
  });

  it('refuses every request when no (or a too-short) secret is configured', () => {
    expect(isAuthorizedCronRequest('Bearer ', undefined)).toBe(false);
    expect(isAuthorizedCronRequest('Bearer short', 'short')).toBe(false);
  });
});

describe('runScheduledOtaSync', () => {
  function fakeClient(rows: unknown[]) {
    const filters: string[] = [];
    const builder: any = {
      select: () => builder,
      not: (column: string) => { filters.push(`not:${column}`); return builder; },
      neq: (column: string, value: string) => { filters.push(`neq:${column}=${value}`); return builder; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return { client: { from: () => builder } as any, filters };
  }

  it('syncs only mapped, active connections and summarises successes, conflicts and failures', async () => {
    const rows = [
      { id: 'c1', provider: 'Booking.com - 101' },
      { id: 'c2', provider: 'Airbnb - 101' },
      { id: 'c3', provider: 'Agoda - 102' },
    ];
    const { client, filters } = fakeClient(rows);
    syncMocks.syncOtaConnection.mockImplementation(async (_client, connection: any) => {
      if (connection.id === 'c3') throw new Error('iCal feed returned HTTP 403.');
      return { conflictCount: connection.id === 'c2' ? 1 : 0 };
    });

    const summary = await runScheduledOtaSync(client, 2);

    expect(filters).toEqual(['not:ical_import_url', 'not:room_id', 'neq:status=disconnected']);
    expect(summary).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      conflicts: 1,
      failures: [{ connectionId: 'c3', provider: 'Agoda - 102', error: 'iCal feed returned HTTP 403.' }],
    });
    expect(syncMocks.syncOtaConnection).toHaveBeenCalledTimes(3);
    expect(syncMocks.syncOtaConnection.mock.calls[0][2]).toEqual({ skipUnchangedLog: true });
  });

  it('handles an empty connection list', async () => {
    syncMocks.syncOtaConnection.mockClear();
    const { client } = fakeClient([]);

    await expect(runScheduledOtaSync(client)).resolves.toMatchObject({ total: 0, succeeded: 0, failed: 0 });
    expect(syncMocks.syncOtaConnection).not.toHaveBeenCalled();
  });
});
