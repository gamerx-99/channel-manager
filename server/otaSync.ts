import type { SupabaseClient } from '@supabase/supabase-js';
import { createRlsSupabaseClient } from './supabase';
import { fetchPublicIcalFeed } from './icalUrl';
import { parseIcalEvents, type IcalEvent } from './icalFeed';

export type OtaConnectionStatus = 'active' | 'connected' | 'conflict' | 'error' | 'disconnected';

export interface OtaConnectionRow {
  id: string;
  hotel_id: string;
  provider: string; // free-text channel label, e.g. 'Booking.com - 101'
  status: OtaConnectionStatus | string;
  /** Single-room mode. Mutually exclusive with room_type_id. */
  room_id?: string | null;
  /** Room-type mode: events go to any free room of the type. */
  room_type_id?: string | null;
  ical_import_url?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  ical_export_token?: string;
}

/** What the client sees: the export token is replaced by a ready-to-paste URL, or hidden. */
export type OtaConnectionView = Omit<OtaConnectionRow, 'ical_export_token'> & {
  ical_export_url: string | null;
};

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

export type IcalSyncConflict = { uid: string; start: string; end: string };

export type IcalBlockSyncResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  conflicts: IcalSyncConflict[];
};

const CONNECTION_COLUMNS = 'id,hotel_id,provider,status,room_id,room_type_id,ical_import_url,last_sync_at,last_error,ical_export_token';
const MAX_FEED_BYTES = 2_000_000;

function getPublicAppUrl(): string {
  // Same fallback as inviteAuthUser in ./supabase.
  return (process.env.PUBLIC_APP_URL
    || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://channel-manager-seven-blue.vercel.app'))
    .replace(/\/+$/, '');
}

export function buildIcalExportUrl(token: string): string {
  return `${getPublicAppUrl()}/api/ical/${token}.ics`;
}

export function toOtaConnectionView(row: OtaConnectionRow, includeExportUrl: boolean): OtaConnectionView {
  const { ical_export_token: token, ...rest } = row;
  return { ...rest, ical_export_url: includeExportUrl && token ? buildIcalExportUrl(token) : null };
}

export function buildIcalSyncPayload(events: IcalEvent[], result: IcalBlockSyncResult) {
  return {
    syncType: 'iCal blocked dates',
    processedItemCount: events.length,
    updatedItemCount: result.inserted + result.updated + result.cancelled,
    inserted: result.inserted,
    updated: result.updated,
    cancelled: result.cancelled,
    unchanged: result.unchanged,
    conflicts: result.conflicts,
  };
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

export async function fetchIcalEvents(url: string): Promise<IcalEvent[]> {
  const response = await fetchPublicIcalFeed(url);
  if (!response.ok) throw new Error(`iCal feed returned HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_FEED_BYTES) {
    throw new Error('The iCal feed is larger than the supported 2 MB limit.');
  }

  const feed = await response.text();
  if (feed.length > MAX_FEED_BYTES) throw new Error('The iCal feed is larger than the supported 2 MB limit.');
  if (!/BEGIN:VCALENDAR/i.test(feed)) throw new Error('The URL did not return an iCal calendar.');
  return parseIcalEvents(feed);
}

export async function getOtaConnections(
  accessToken: string,
  hotelId: string,
  options: { includeExportUrl?: boolean } = {},
): Promise<OtaConnectionView[]> {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_connections')
    .select(CONNECTION_COLUMNS)
    .eq('hotel_id', hotelId)
    .order('provider');

  if (error) {
    throw new Error(`Failed to fetch OTA calendar connections: ${error.message}`);
  }
  return ((data ?? []) as OtaConnectionRow[]).map((row) => toOtaConnectionView(row, Boolean(options.includeExportUrl)));
}

export async function getGlobalOtaSummary(accessToken: string): Promise<any[]> {
  const client = createRlsSupabaseClient(accessToken);
  const { data: connections, error: connError } = await client
    .from('ota_connections')
    .select('id,hotel_id,provider,status,room_id,room_type_id,ical_import_url,last_sync_at,last_error,hotels(name)');

  if (connError) {
    // Graceful fallback if table does not exist or schema cache is not yet refreshed
    console.warn("[OTA Summary] ota_connections table unavailable:", connError.message);
    return [];
  }

  // One small query per connection, run concurrently rather than one after another.
  return Promise.all((connections || []).map(async (row: any) => {
    const { data: logs } = await client
      .from('ota_sync_logs')
      .select('id,hotel_id,provider,direction,action,status,response,error_message,created_at')
      .eq('hotel_id', row.hotel_id)
      .eq('provider', row.provider)
      .order('created_at', { ascending: false })
      .limit(5);

    const latestLog = logs && logs.length > 0 ? logs[0] : null;
    const recentUpdatedItemCount = (logs || [])
      .filter(l => l.action === 'sync_calendar' && l.status === 'success')
      .reduce((total, log) => total + getUpdatedItemCount(log), 0);

    return {
      ...row,
      hotel_name: row.hotels?.name || 'Property',
      latest_log: latestLog,
      recent_updated_item_count: recentUpdatedItemCount,
      // Keep the old field for clients that have not been upgraded yet. Its
      // value now represents updated items, never the number of sync runs.
      recent_synced_count: recentUpdatedItemCount,
      logs: logs || []
    };
  }));
}

export async function upsertOtaConnection(
  accessToken: string,
  hotelId: string,
  provider: string,
  status: string,
  icalImportUrl?: string,
  target: { roomId?: string | null; roomTypeId?: string | null } = {},
): Promise<OtaConnectionView> {
  // A connection blocks one room OR one room type; choosing one clears the other.
  const mapping = target.roomTypeId
    ? { room_id: null, room_type_id: target.roomTypeId }
    : target.roomId !== undefined
      ? { room_id: target.roomId, room_type_id: null }
      : {};
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_connections')
    .upsert({
      hotel_id: hotelId,
      provider,
      status,
      ical_import_url: icalImportUrl,
      ...mapping,
      updated_at: new Date().toISOString()
    }, { onConflict: 'hotel_id,provider' })
    .select(CONNECTION_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.code ? `${error.code}: ${error.message}` : `Failed to upsert OTA calendar connection: ${error.message}`);
  }
  return toOtaConnectionView(data as OtaConnectionRow, true);
}

export async function logOtaSync(client: SupabaseClient, log: OtaSyncLogInsert): Promise<void> {
  const { error } = await client.from('ota_sync_logs').insert(log);
  if (error) {
    throw new Error(`Failed to write OTA sync log: ${error.message}`);
  }
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

async function recordSyncFailure(client: SupabaseClient, connection: OtaConnectionRow, message: string) {
  try {
    await logOtaSync(client, {
      hotel_id: connection.hotel_id,
      provider: connection.provider,
      direction: 'inbound',
      action: 'sync_calendar',
      status: 'failed',
      error_message: message
    });
  } catch (logError: any) {
    console.error('[OTA Sync] failed to record failed sync log:', logError?.message || logError);
  }

  const { error } = await client
    .from('ota_connections')
    .update({ status: 'error', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', connection.id);
  if (error) console.error('[OTA Sync] failed to mark connection as error:', error.message);
}

/**
 * Fetches one connection's feed and reconciles it into blocking bookings on the
 * mapped room, atomically, via sync_ota_ical_blocks. `client` decides whose
 * authority applies: a request-scoped RLS client (manual sync) or the scheduler's
 * service-role client (see ./otaScheduler).
 */
export async function syncOtaConnection(
  client: SupabaseClient,
  connection: OtaConnectionRow,
  options: { skipUnchangedLog?: boolean } = {},
) {
  const startTime = Date.now();
  try {
    if (!connection.ical_import_url) {
      throw new Error(`No iCal import URL is configured for ${connection.provider}.`);
    }
    if (!connection.room_id && !connection.room_type_id) {
      throw new Error(`Choose the room or room type that ${connection.provider} blocks before syncing.`);
    }

    const events = await fetchIcalEvents(connection.ical_import_url);
    const { data, error } = await client.rpc('sync_ota_ical_blocks', {
      target_connection_id: connection.id,
      events,
    });
    if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);

    const result = data as IcalBlockSyncResult;
    const syncPayload = buildIcalSyncPayload(events, result);
    const responsePayload = {
      message: result.conflicts.length > 0
        ? `${result.conflicts.length} event(s) from ${connection.provider} overlap existing bookings on this room`
        : `Successfully synchronized iCal calendar with ${connection.provider}`,
      processedItemCount: syncPayload.processedItemCount,
      updatedItemCount: syncPayload.updatedItemCount,
      conflictCount: result.conflicts.length,
    };

    // ASSUMPTION: scheduled runs skip logging no-op successes so a 15-minute cron
    // does not flood ota_sync_logs; last_sync_at still records every run.
    if (!(options.skipUnchangedLog && syncPayload.updatedItemCount === 0 && result.conflicts.length === 0)) {
      await logOtaSync(client, {
        hotel_id: connection.hotel_id,
        provider: connection.provider,
        direction: 'inbound',
        action: 'sync_calendar',
        status: 'success',
        payload: syncPayload,
        response: responsePayload
      });
    }

    return {
      success: true,
      durationMs: Date.now() - startTime,
      updatedItemCount: syncPayload.updatedItemCount,
      conflictCount: result.conflicts.length,
      conflicts: result.conflicts,
      response: responsePayload,
    };
  } catch (err: any) {
    await recordSyncFailure(client, connection, err?.message || 'Unknown calendar sync error');
    throw err;
  }
}

export async function triggerOtaCalendarSync(
  accessToken: string,
  hotelId: string,
  provider: string
) {
  const client = createRlsSupabaseClient(accessToken);
  const { data, error } = await client
    .from('ota_connections')
    .select(CONNECTION_COLUMNS)
    .eq('hotel_id', hotelId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch OTA calendar connection: ${error.message}`);
  if (!data) throw new Error(`No iCal import URL is configured for ${provider}.`);

  return syncOtaConnection(client, data as OtaConnectionRow);
}

export async function deleteOtaConnection(
  accessToken: string,
  hotelId: string,
  provider: string
): Promise<void> {
  const client = createRlsSupabaseClient(accessToken);
  const { error } = await client
    .from('ota_connections')
    .delete()
    .eq('hotel_id', hotelId)
    .eq('provider', provider);

  if (error) {
    throw new Error(`Failed to delete OTA connection: ${error.message}`);
  }
}
