import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  runScheduledOtaSync: vi.fn(),
}));

vi.mock('./supabase', () => ({ createRlsSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('./otaScheduler', async () => {
  const actual = await vi.importActual<typeof import('./otaScheduler')>('./otaScheduler');
  return { ...actual, runScheduledOtaSync: mocks.runScheduledOtaSync };
});

import { handleIcalExport, handleScheduledOtaSync } from './otaIcalRoutes';

const TOKEN = 'ab'.repeat(32);

function fakeResponse() {
  const res: any = { statusCode: 0, headers: {} as Record<string, string>, body: undefined as unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.set = (name: string, value: string) => { res.headers[name.toLowerCase()] = value; return res; };
  res.type = (value: string) => { res.headers['content-type'] = value; return res; };
  res.send = (body: unknown) => { res.body = body; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ical/:file', () => {
  it('serves the room calendar for a valid token', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { calendarName: 'Seaside · 101', events: [{ uid: 'b1', start: '2026-10-29', end: '2026-10-30' }] }, error: null });
    const res = fakeResponse();

    await handleIcalExport({ params: { file: `${TOKEN}.ics` } } as any, res);

    expect(mocks.rpc).toHaveBeenCalledWith('get_ota_ical_export', { export_token: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.body).toContain('DTSTART;VALUE=DATE:20261029');
  });

  it('returns 404 for an unknown token without leaking anything', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const res = fakeResponse();

    await handleIcalExport({ params: { file: `${TOKEN}.ics` } } as any, res);

    expect(res.statusCode).toBe(404);
  });

  it('never queries the database for a malformed token', async () => {
    const res = fakeResponse();

    await handleIcalExport({ params: { file: "'; drop table bookings; --.ics" } } as any, res);

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/cron/ota-ical-sync', () => {
  const request = (authorization?: string) => ({ header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) }) as any;

  it('rejects calls without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 'a-very-long-cron-secret-value');
    const res = fakeResponse();

    await handleScheduledOtaSync(request('Bearer wrong'), res);

    expect(res.statusCode).toBe(401);
    expect(mocks.runScheduledOtaSync).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('runs the scheduled sync for an authorized caller', async () => {
    vi.stubEnv('CRON_SECRET', 'a-very-long-cron-secret-value');
    mocks.runScheduledOtaSync.mockResolvedValueOnce({ total: 1, succeeded: 1, failed: 0, conflicts: 0, failures: [] });
    const res = fakeResponse();

    await handleScheduledOtaSync(request('Bearer a-very-long-cron-secret-value'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ total: 1, succeeded: 1 });
    vi.unstubAllEnvs();
  });
});
