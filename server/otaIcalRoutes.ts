import type { Express, Request, Response } from 'express';
import { createRlsSupabaseClient } from './supabase';
import { buildIcalExport, type IcalExportEvent } from './icalFeed';
import { isAuthorizedCronRequest, runScheduledOtaSync } from './otaScheduler';

type IcalExportData = { calendarName: string; events: IcalExportEvent[] } | null;

const EXPORT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Reads the token-gated export through an anon client; the RPC returns NULL for unknown tokens. */
export async function loadIcalExport(token: string): Promise<IcalExportData> {
  if (!EXPORT_TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await createRlsSupabaseClient().rpc('get_ota_ical_export', { export_token: token });
  if (error) throw new Error(`Failed to load iCal export: ${error.message}`);
  return (data as IcalExportData) ?? null;
}

export async function handleIcalExport(req: Request, res: Response) {
  const token = String(req.params.file ?? '').replace(/\.ics$/i, '').toLowerCase();
  try {
    const exportData = await loadIcalExport(token);
    if (!exportData) {
      res.status(404).type('text/plain').send('Calendar not found.');
      return;
    }
    res
      .status(200)
      .set('Cache-Control', 'no-cache, max-age=0')
      .type('text/calendar; charset=utf-8')
      .send(buildIcalExport({ calendarName: exportData.calendarName, events: exportData.events }));
  } catch (error: any) {
    console.error('[OTA iCal export] failed:', error?.message ?? error);
    res.status(500).type('text/plain').send('Calendar is temporarily unavailable.');
  }
}

export async function handleScheduledOtaSync(req: Request, res: Response) {
  if (!isAuthorizedCronRequest(req.header('authorization'))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const summary = await runScheduledOtaSync();
    if (summary.failed > 0) console.warn('[OTA scheduled sync] failures:', JSON.stringify(summary.failures));
    res.status(200).json(summary);
  } catch (error: any) {
    console.error('[OTA scheduled sync] failed:', error?.message ?? error);
    res.status(500).json({ error: error?.message ?? 'Scheduled sync failed' });
  }
}

export function registerOtaIcalRoutes(app: Express) {
  // Public: OTAs (Booking.com, Airbnb, ...) poll this URL; the token is the only credential.
  app.get('/api/ical/:file', handleIcalExport);
  // Called by Supabase pg_cron (see ota_ical_sync_cron_setup.sql).
  app.post('/api/cron/ota-ical-sync', handleScheduledOtaSync);
}
