import { createHash } from 'node:crypto';
import { createRlsSupabaseClient } from './supabase';

export interface OtaConnectionRow {
  id: string;
  hotel_id: string;
  provider: string; // 'agoda' | 'booking' | 'airbnb' | 'expedia'
  status: string;
  ical_import_url?: string;
  ical_export_url?: string;
  last_sync_at?: string;
}

export interface OtaSyncLogInsert {
  hotel_id: string;
  provider: string;
  direction: 'inbound' | 'outbound';
  action: string;
  status: 'success' | 'failed';
  payload?: any;
  response?: any;
  error_message?: string;
}

export type OtaSyncLogSummary = OtaSyncLogInsert & {
  created_at?: string;
};

export type IcalEventFingerprint = {
  uid: string;
  fingerprint: string;
};

function hashEvent(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Parse VEVENT blocks and retain only a stable UID plus a privacy-safe hash. */
export function parseIcalEventFingerprints(feed: string): IcalEventFingerprint[] {
  const unfoldedLines = feed.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: IcalEventFingerprint[] = [];
  let current: string[] | null = null;

  for (const line of unfoldedLines) {
    if (line.trim().toUpperCase() === 'BEGIN:VEVENT') {
      current = [line];
      continue;
    }
    if (!current) continue;

    current.push(line);
    if (line.trim().toUpperCase() !== 'END:VEVENT') continue;

    const uidLine = current.find((candidate) => candidate.toUpperCase().startsWith('UID:'));
    const uid = uidLine?.slice(uidLine.indexOf(':') + 1).trim() || `event-${events.length + 1}`;
    events.push({ uid, fingerprint: hashEvent(current) });
    current = null;
  }

  return events;
}

/** Count added, changed, and removed VEVENT records between two feed snapshots. */
export function countUpdatedIcalItems(
  previous: IcalEventFingerprint[],
  current: IcalEventFingerprint[],
): number {
  const previousByUid = new Map(previous.map((event) => [event.uid, event.fingerprint]));
  const currentByUid = new Map(current.map((event) => [event.uid, event.fingerprint]));
  let changed = 0;

  currentByUid.forEach((fingerprint, uid) => {
    if (previousByUid.get(uid) !== fingerprint) changed += 1;
  });
  previousByUid.forEach((_fingerprint, uid) => {
    if (!currentByUid.has(uid)) changed += 1;
  });

  return changed;
}

export function buildIcalSyncPayload(
  previous: IcalEventFingerprint[],
  current: IcalEventFingerprint[],
) {
  return {
    syncType: 'iCal availability & blocked dates',
    processedItemCount: current.length,
    updatedItemCount: countUpdatedIcalItems(previous, current),
    eventFingerprints: current,
  };
}

function validateIcalImportUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const blockedHost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname === '::1'
    || hostname.endsWith('.localhost')
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  if (!['http:', 'https:'].includes(url.protocol) || blockedHost) {
    throw new Error('The iCal import URL must be a public HTTP(S) URL.');
  }
  return url.toString();
}

export async function fetchIcalEventFingerprints(url: string): Promise<IcalEventFingerprint[]> {
  const response = await fetch(validateIcalImportUrl(url), {
    headers: { Accept: 'text/calendar, text/plain;q=0.9' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`iCal feed returned HTTP ${response.status}.`);

  const feed = await response.text();
  if (feed.length > 2_000_000) throw new Error('The iCal feed is larger than the supported 2 MB limit.');
  return parseIcalEventFingerprints(feed);
}

async function getPreviousIcalSnapshot(
  accessToken: string,
  hotelId: string,
  provider: string,
): Promise<IcalEventFingerprint[]> {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_sync_logs')
    .select('payload')
    .eq('hotel_id', hotelId)
    .eq('provider', provider)
    .eq('action', 'sync_calendar')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch previous iCal snapshot: ${error.message}`);
  const snapshot = data?.payload && typeof data.payload === 'object'
    ? (data.payload as Record<string, unknown>).eventFingerprints
    : null;
  return Array.isArray(snapshot) ? snapshot as IcalEventFingerprint[] : [];
}

function readNonNegativeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Reads the count reported by the iCal sync operation. A missing count is
 * treated as zero because the current calendar-only adapter did not update a
 * record; it must never be inferred from the number of successful runs.
 */
export function getUpdatedItemCount(log: Pick<OtaSyncLogSummary, 'payload' | 'response'>): number {
  const sources = [log.response, log.payload];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;
    const count = [record.updatedItemCount, record.updated_item_count, record.importedCount, record.imported_count]
      .map(readNonNegativeCount)
      .find((candidate): candidate is number => candidate !== null);
    if (count !== undefined) return count;
  }
  return 0;
}

export async function getOtaConnections(accessToken: string, hotelId: string): Promise<OtaConnectionRow[]> {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_connections')
    .select('*')
    .eq('hotel_id', hotelId);

  if (error) {
    throw new Error(`Failed to fetch OTA calendar connections: ${error.message}`);
  }
  return data || [];
}

export async function getGlobalOtaSummary(accessToken: string): Promise<any[]> {
  const client = createRlsSupabaseClient(accessToken);
  const { data: connections, error: connError } = await client
    .from('ota_connections')
    .select('*, hotels(name)');

  if (connError) {
    // Graceful fallback if table does not exist or schema cache is not yet refreshed
    console.warn("[OTA Summary] ota_connections table unavailable:", connError.message);
    return [];
  }

  const results = [];
  for (const row of (connections || [])) {
    const { data: logs } = await client
      .from('ota_sync_logs')
      .select('*')
      .eq('hotel_id', row.hotel_id)
      .eq('provider', row.provider)
      .order('created_at', { ascending: false })
      .limit(5);

    const latestLog = logs && logs.length > 0 ? logs[0] : null;
    const recentUpdatedItemCount = (logs || [])
      .filter(l => l.action === 'sync_calendar' && l.status === 'success')
      .reduce((total, log) => total + getUpdatedItemCount(log), 0);

    results.push({
      ...row,
      hotel_name: row.hotels?.name || 'Property',
      latest_log: latestLog,
      recent_updated_item_count: recentUpdatedItemCount,
      // Keep the old field for clients that have not been upgraded yet. Its
      // value now represents updated items, never the number of sync runs.
      recent_synced_count: recentUpdatedItemCount,
      logs: logs || []
    });
  }

  return results;
}

export async function upsertOtaConnection(
  accessToken: string,
  hotelId: string,
  provider: string,
  status: string,
  icalImportUrl?: string,
  icalExportUrl?: string
): Promise<OtaConnectionRow> {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_connections')
    .upsert({
      hotel_id: hotelId,
      provider,
      status,
      ical_import_url: icalImportUrl,
      ical_export_url: icalExportUrl,
      updated_at: new Date().toISOString()
    }, { onConflict: 'hotel_id,provider' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert OTA calendar connection: ${error.message}`);
  }
  return data;
}

export async function logOtaSync(accessToken: string, log: OtaSyncLogInsert): Promise<void> {
  const client = createRlsSupabaseClient(accessToken);
  await client.from('ota_sync_logs').insert(log);
}

export async function getOtaSyncLogs(accessToken: string, hotelId: string, limit = 50) {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_sync_logs')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch OTA calendar sync logs: ${error.message}`);
  }
  return data || [];
}

export async function triggerOtaCalendarSync(
  accessToken: string,
  hotelId: string,
  provider: string
) {
  const startTime = Date.now();
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | undefined;
  let updatedItemCount = 0;
  let responsePayload: any;

  try {
    if (!['agoda', 'booking', 'airbnb', 'expedia'].includes(provider)) {
      throw new Error(`Unsupported OTA provider: ${provider}`);
    }

    const connection = (await getOtaConnections(accessToken, hotelId))
      .find((candidate) => candidate.provider === provider);
    if (!connection?.ical_import_url) {
      throw new Error(`No iCal import URL is configured for ${provider}.`);
    }

    const [previousSnapshot, currentSnapshot] = await Promise.all([
      getPreviousIcalSnapshot(accessToken, hotelId, provider),
      fetchIcalEventFingerprints(connection.ical_import_url),
    ]);
    const syncPayload = buildIcalSyncPayload(previousSnapshot, currentSnapshot);
    updatedItemCount = syncPayload.updatedItemCount;
    responsePayload = {
      message: `Successfully synchronized iCal calendar with ${provider}`,
      processedItemCount: syncPayload.processedItemCount,
      updatedItemCount,
    };

    await logOtaSync(accessToken, {
      hotel_id: hotelId,
      provider,
      direction: 'inbound',
      action: 'sync_calendar',
      status: 'success',
      payload: syncPayload,
      response: responsePayload
    });

    const client = createRlsSupabaseClient(accessToken);
    await client
      .from('ota_connections')
      .update({ last_sync_at: new Date().toISOString(), status: 'connected', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('provider', provider);

    return { success: true, durationMs: Date.now() - startTime, updatedItemCount, response: responsePayload };
  } catch (err: any) {
    status = 'failed';
    errorMessage = err.message || 'Unknown calendar sync error';
    await logOtaSync(accessToken, {
      hotel_id: hotelId,
      provider,
      direction: 'inbound',
      action: 'sync_calendar',
      status: 'failed',
      error_message: errorMessage
    });
    throw err;
  }
}
