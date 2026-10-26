import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from './supabase';
import { syncOtaConnection, type OtaConnectionRow } from './otaSync';

const SCHEDULED_CONNECTION_COLUMNS = 'id,hotel_id,provider,status,room_id,room_type_id,ical_import_url,last_sync_at,last_error';
const DEFAULT_CONCURRENCY = 3;

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`; refuses when no secret is configured. */
export function isAuthorizedCronRequest(authorization: string | undefined, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type ScheduledOtaSyncSummary = {
  total: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  failures: Array<{ connectionId: string; provider: string; error: string }>;
};

/**
 * Cron entry point: syncs every connection that has an import URL and a room or room type.
 * There is no end user on a cron request, so this is the one place OTA sync runs
 * with the service-role client; sync_ota_ical_blocks accepts that role explicitly.
 */
export async function runScheduledOtaSync(
  client: SupabaseClient = createSupabaseAdminClient(),
  concurrency = DEFAULT_CONCURRENCY,
): Promise<ScheduledOtaSyncSummary> {
  const { data, error } = await client
    .from('ota_connections')
    .select(SCHEDULED_CONNECTION_COLUMNS)
    .not('ical_import_url', 'is', null)
    .or('room_id.not.is.null,room_type_id.not.is.null')
    .neq('status', 'disconnected');
  if (error) throw new Error(`Failed to list OTA connections for scheduled sync: ${error.message}`);

  const connections = (data ?? []) as OtaConnectionRow[];
  const summary: ScheduledOtaSyncSummary = { total: connections.length, succeeded: 0, failed: 0, conflicts: 0, failures: [] };
  const queue = [...connections];

  async function worker() {
    for (let connection = queue.shift(); connection; connection = queue.shift()) {
      try {
        const result = await syncOtaConnection(client, connection, { skipUnchangedLog: true });
        summary.succeeded += 1;
        summary.conflicts += result.conflictCount;
      } catch (syncError: any) {
        summary.failed += 1;
        summary.failures.push({ connectionId: connection.id, provider: connection.provider, error: syncError?.message ?? String(syncError) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, connections.length)) }, worker));
  return summary;
}
