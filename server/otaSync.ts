import { createHash, randomUUID } from 'node:crypto';
import { isMissingTableError } from './db/utils';

/**
 * iCal feed construction for outbound sync (Property -> OTA).
 *
 * One VEVENT per OTA-blocked room-night: a booking occupying a room that is
 * mapped to an OTA connection, or a manual block. Events are all-day
 * (DTSTART;VALUE=DATE) with the half-open interval convention (DTEND = date+1),
 * matching the availability engine's overlap rule
 * (`check_in < target_check_out && check_out > target_check_in`).
 */

/** Number of nights covered by a half-open [checkIn, checkOut) date range. */
export function countNights(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Expands a half-open `[start, end)` date range into its individual
 * `YYYY-MM-DD` nights. Multi-night OTA reservations collapse to one block row
 * per night so that cancelling part of a stay re-opens exactly the freed
 * nights when the previous event's UID disappears from the feed.
 */
export function expandDateRange(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return dates;
  const current = new Date(start);
  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

import { createRlsSupabaseClient, createSupabaseAdminClient } from './supabase';
import {
  listOtaImportBlocks,
  listOwnBookingNights,
  replaceOtaImportBlocks,
  resolveRoomTypesBySummary,
} from './db/otaBlocks';

export interface OtaConnectionRow {
  id: string;
  hotel_id: string;
  provider: string; // 'agoda' | 'booking' | 'airbnb' | 'expedia'
  status: string;
  ical_import_url?: string;
  ical_export_url?: string;
  ical_feed_token?: string;
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
    const uid = uidLine?.slice(uidLine.indexOf(':') + 1).trim();
    // ASSUMPTION: events without a stable UID cannot be tracked across syncs
    // (cancellation = UID disappears), so they are skipped, not persisted.
    if (!uid) continue;
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

/** Fetches the raw iCal feed text (same limits as fetchIcalEventFingerprints). */
export async function fetchIcalFeedText(url: string): Promise<string> {
  const response = await fetch(validateIcalImportUrl(url), {
    headers: { Accept: 'text/calendar, text/plain;q=0.9' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`iCal feed returned HTTP ${response.status}.`);

  const feed = await response.text();
  if (feed.length > 2_000_000) throw new Error('The iCal feed is larger than the supported 2 MB limit.');
  return feed;
}

export type ParsedIcalEvent = {
  uid: string;
  summary: string;
  /** Individual `YYYY-MM-DD` nights covered by the event ([start, end) exclusive). */
  nights: string[];
};

/** Extracts the `YYYY-MM-DD` date part from an iCal DATE or DATE-TIME value. */
function parseIcalDateValue(value: string): string | null {
  // Accept both 20260820 and 20260820T000000Z forms; take the date part only.
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * Parses full VEVENT records (UID, SUMMARY, DTSTART/DTEND) from an inbound
 * iCal feed. Multi-night reservations are expanded into one night per date so
 * a cancelled/shortened reservation re-opens exactly the freed nights.
 */
export function parseIcalEvents(feed: string): ParsedIcalEvent[] {
  const unfoldedLines = feed.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: ParsedIcalEvent[] = [];
  let current: string[] | null = null;

  const readProp = (lines: string[], name: string): string | null => {
    const line = lines.find((candidate) => candidate.toUpperCase().startsWith(`${name}:`))
      ?? lines.find((candidate) => candidate.toUpperCase().startsWith(`${name};`));
    if (!line) return null;
    return line.slice(line.indexOf(':') + 1).trim();
  };

  for (const line of unfoldedLines) {
    if (line.trim().toUpperCase() === 'BEGIN:VEVENT') {
      current = [line];
      continue;
    }
    if (!current) continue;
    current.push(line);
    if (line.trim().toUpperCase() !== 'END:VEVENT') continue;

    const uidLine = current.find((candidate) => candidate.toUpperCase().startsWith('UID:'));
    const uid = uidLine ? uidLine.slice(uidLine.indexOf(':') + 1).trim() : '';
    const summary = readProp(current, 'SUMMARY') ?? '';
    const dtStart = readProp(current, 'DTSTART');
    const dtEnd = readProp(current, 'DTEND');
    if (!uid || !dtStart) {
      current = null;
      continue;
    }
    const startIso = parseIcalDateValue(dtStart);
    const endIso = dtEnd ? parseIcalDateValue(dtEnd) : null;
    if (startIso && endIso && endIso > startIso) {
      events.push({ uid, summary, nights: expandDateRange(startIso, endIso) });
    } else if (startIso) {
      // Missing/invalid DTEND: treat the event as blocking only its start night.
      events.push({ uid, summary, nights: [startIso] });
    }
    current = null;
  }

  return events;
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

  // Every hotel gets exactly one outbound feed token (shared by all its
  // provider connections). Generate it lazily on the first connection upsert.
  let icalFeedToken: string | undefined;
  try {
    const { data: existingToken, error: tokenError } = await client
      .from('ota_connections')
      .select('ical_feed_token')
      .eq('hotel_id', hotelId)
      .not('ical_feed_token', 'is', null)
      .limit(1)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (typeof existingToken?.ical_feed_token === 'string' && existingToken.ical_feed_token) {
      icalFeedToken = existingToken.ical_feed_token;
    }
  } catch (tokenError) {
    throw new Error(`Failed to resolve the iCal feed token: ${(tokenError as Error).message}`);
  }
  if (!icalFeedToken) {
    icalFeedToken = createHash('sha256').update(randomUUID()).digest('hex');
  }

  const { data, error } = await client
    .from('ota_connections')
    .upsert({
      hotel_id: hotelId,
      provider,
      status,
      ical_import_url: icalImportUrl,
      ical_export_url: icalExportUrl,
      ical_feed_token: icalFeedToken,
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
    const connection = (await getOtaConnections(accessToken, hotelId))
      .find((candidate) => candidate.provider === provider);
    if (!connection?.ical_import_url) {
      throw new Error(`No iCal import URL is configured for ${provider}.`);
    }

    const [previousSnapshot, currentSnapshot, currentFeed] = await Promise.all([
      getPreviousIcalSnapshot(accessToken, hotelId, provider),
      fetchIcalEventFingerprints(connection.ical_import_url),
      fetchIcalFeedText(connection.ical_import_url),
    ]);
    const syncPayload = buildIcalSyncPayload(previousSnapshot, currentSnapshot);
    updatedItemCount = syncPayload.updatedItemCount;
    responsePayload = {
      message: `Successfully synchronized iCal calendar with ${provider}`,
      processedItemCount: syncPayload.processedItemCount,
      updatedItemCount,
    };

    // Two-way sync: persist the imported block set and rebuild the outbound
    // feed so OTAs importing our calendar immediately see the freed nights.
    // A block-apply failure FAILS the sync run (not silent): the availability
    // change is the whole point of the sync, and last_sync_at must not claim
    // success when rooms were not actually closed/re-opened.
    const client = createRlsSupabaseClient(accessToken);
    const events = parseIcalEvents(currentFeed);
    const { bySummary, unmatched } = await resolveRoomTypesBySummary(
      client,
      hotelId,
      events.map((event) => event.summary),
    );
    const resolvedEvents = events
      .map((event) => {
        const roomTypeId = bySummary.get(event.summary.trim().toLowerCase());
        return roomTypeId ? { uid: event.uid, room_type_id: roomTypeId, nights: event.nights } : null;
      })
      .filter((event): event is { uid: string; room_type_id: string; nights: string[] } => Boolean(event));
    // An event present in the feed but NOT resolvable to a room type (name
    // mismatch, or the hotel renamed its room type) must never cause its
    // existing block to be deleted. Dropping it from resolvedEvents would put
    // its stored block in `removed` and re-open a room the OTA still holds.
    // We keep the block and surface the problem instead of over-selling.
    const unresolvedUids = new Set(
      events
        .filter(event => !bySummary.has(event.summary.trim().toLowerCase()))
        .map(event => event.uid),
    );
    // Scoped to THIS provider: the block key includes `provider`, so reading
    // the whole hotel would let another OTA's row satisfy this feed's key and
    // silently skip inserting this provider's reservation.
    const previousBlocks = await listOtaImportBlocks(client, hotelId, provider);
    const diff = buildOtaImportBlockDiff(
      selectDeletableBlocks(
        previousBlocks.map((block) => ({
          room_type_id: block.room_type_id,
          date: block.date,
          source_uid: block.source_uid,
        })),
        unresolvedUids,
      ),
      resolvedEvents,
    );
    if (unresolvedUids.size > 0) {
      console.warn(
        `[ota-sync] ${provider}: ${unresolvedUids.size} feed event(s) did not match a room type; ` +
        `their existing blocks were left untouched. Unmatched names: ${unmatched.join(', ') || '(unknown)'}`,
      );
    }
    await replaceOtaImportBlocks(client, hotelId, provider, diff.removed, diff.added);
    await rebuildOwnExportFeed(accessToken, hotelId);

    await client
      .from('ota_connections')
      .update({ last_sync_at: new Date().toISOString(), status: 'connected', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('provider', provider);

    // Logged only AFTER the block apply and last_sync_at. getPreviousIcalSnapshot
    // filters on status='success', so a success row written before the apply
    // would make the next run diff against a snapshot whose inventory change
    // never happened — reporting "0 changed" for a run that moved rooms.
    await logOtaSync(accessToken, {
      hotel_id: hotelId,
      provider,
      direction: 'inbound',
      action: 'sync_calendar',
      status: 'success',
      payload: syncPayload,
      response: responsePayload
    });

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

  // Orphaned import blocks would close rooms forever with no feed left to
  // re-open them, so remove this provider's blocks together with the
  // connection. A missing ota_import_blocks table (migration not applied
  // yet) is not a failure — there is nothing to clean up.
  try {
    const { error: blocksError } = await client
      .from('ota_import_blocks')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('provider', provider);
    if (blocksError && !isMissingTableError('ota_import_blocks', blocksError)) {
      throw new Error(`Failed to delete OTA import blocks: ${blocksError.message}`);
    }
  } catch (err) {
    if (!isMissingTableError('ota_import_blocks', err)) throw err;
  }
}

export type OtaBlockedNightInput = {
  hotel_id: string;
  room_type_id: string;
  date: string;
};

const icalEscape = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Builds the stable VEVENT UID for one OTA-blocked room-night. */
export function buildOtaBlockUid(hotelId: string, roomTypeId: string, date: string): string {
  return `ota-block-${hotelId}-${roomTypeId}-${date}@channel-manager`;
}

/** Normalizes raw blocked rows into one deduplicated, sorted event per room type / night. */
export function buildOtaBlockedNights(
  rows: Array<{ hotel_id: string; room_type_id: string; date: string }>,
): Array<{ hotel_id: string; room_type_id: string; date: string; uid: string }> {
  const unique = new Map<string, { hotel_id: string; room_type_id: string; date: string }>();
  for (const row of rows) {
    if (!row.hotel_id || !row.room_type_id || !row.date) continue;
    unique.set(`${row.hotel_id}:${row.room_type_id}:${row.date}`, row);
  }
  return Array.from(unique.values())
    .sort((a, b) => a.date.localeCompare(b.date) || a.room_type_id.localeCompare(b.room_type_id))
    .map(row => ({
      hotel_id: row.hotel_id,
      room_type_id: row.room_type_id,
      date: row.date,
      uid: buildOtaBlockUid(row.hotel_id, row.room_type_id, row.date),
    }));
}

export type OtaCalendarOptions = {
  calendarName: string;
  hotelId: string;
  now?: Date;
};

/**
 * Serializes OTA-blocked room-nights into an RFC 5545 VCALENDAR text feed.
 * Pure function: plain data in, plain string out.
 */
export function buildOtaIcalFeed(
  blockedNights: Array<{ hotel_id: string; room_type_id: string; date: string }>,
  options: OtaCalendarOptions,
): string {
  const now = options.now ?? new Date();
  const stamp = `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
  const calendarName = icalEscape(options.calendarName || 'Property availability');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Channel Manager MVP//iCal Export 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
  ];
  for (const night of buildOtaBlockedNights(blockedNights)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${night.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${night.date}`,
      `DTEND;VALUE=DATE:${shiftDate(night.date, 1)}`,
      `SUMMARY:${icalEscape(`Not available (${options.calendarName || 'Property'})`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}


export type OtaImportBlockDiff = {
  removed: Array<{ room_type_id: string; date: string; source_uid: string }>;
  added: Array<{ room_type_id: string; date: string; source_uid: string }>;
};

/**
 * Diffs previously-persisted import blocks against the current inbound events
 * (already resolved to room types), producing the exact delete/insert sets
 * needed to make the stored block set equal the feed's block set. Events whose
 * UID vanished from the feed (cancellation / shortening) release exactly the
 * nights they used to cover; new/extended events block their nights.
 *
 * Pure function: both inputs are plain data, no I/O.
 */
export function buildOtaImportBlockDiff(
  previous: Array<{ room_type_id: string; date: string; source_uid: string }>,
  resolvedEvents: Array<{ uid: string; room_type_id: string; nights: string[] }>,
): OtaImportBlockDiff {
  // Key by (room type, night, source event): several OTA reservations may
  // legitimately block the same room type on the same night (multi-room
  // OTA bookings). Matching the full triple keeps each event's nights
  // independent, so cancelling one event re-opens exactly its own nights.
  const previousKeys = new Set(
    previous.map((block) => `${block.room_type_id}:${block.date}:${block.source_uid}`),
  );
  const removed: Array<{ room_type_id: string; date: string; source_uid: string }> = [];
  const added: Array<{ room_type_id: string; date: string; source_uid: string }> = [];
  const seenKeys = new Set<string>();

  for (const event of resolvedEvents) {
    for (const date of event.nights) {
      const key = `${event.room_type_id}:${date}:${event.uid}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (previousKeys.has(key)) {
        previousKeys.delete(key);
      } else {
        added.push({ room_type_id: event.room_type_id, date, source_uid: event.uid });
      }
    }
  }

  for (const block of previous) {
    const key = `${block.room_type_id}:${block.date}:${block.source_uid}`;
    if (previousKeys.has(key)) {
      removed.push({ room_type_id: block.room_type_id, date: block.date, source_uid: block.source_uid });
    }
  }
  return { removed, added };
}



/**
 * Blocks that are safe to consider for deletion.
 *
 * A feed event whose SUMMARY does not resolve to a room type is NOT evidence of
 * a cancellation — the reservation may well still exist. Dropping such a block
 * from the diff input would re-open a room the OTA still holds, so blocks whose
 * source_uid belongs to an unresolved event are excluded from deletion and kept
 * as-is. The mismatch is logged by the caller instead.
 */
export function selectDeletableBlocks(
  previous: Array<{ room_type_id: string; date: string; source_uid: string }>,
  unresolvedUids: ReadonlySet<string>,
): Array<{ room_type_id: string; date: string; source_uid: string }> {
  return previous.filter(block => !unresolvedUids.has(block.source_uid));
}

/**
 * Rebuilds this hotel's outbound iCal feed artifacts after an inbound sync:
 * recomputes the feed from the property's OWN bookings and records an
 * outbound log entry with event fingerprints so OTA-visible changes are
 * measurable.
 *
 * The Express route (`/api/ical/:hotelId.ics`) always regenerates the feed
 * from the current bookings on request, so this function only maintains the
 * audit trail — the feed content itself is derived, never stored.
 */
export async function rebuildOwnExportFeed(accessToken: string, hotelId: string): Promise<void> {
  const client = createSupabaseAdminClient();
  const { data: previousLog, error: previousLogError } = await client
    .from('ota_sync_logs')
    .select('payload')
    .eq('hotel_id', hotelId)
    .eq('action', 'export_calendar')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousLogError) {
    throw new Error(`Failed to fetch previous export snapshot: ${previousLogError.message}`);
  }
  const previousSnapshot = previousLog?.payload && typeof previousLog.payload === 'object'
    ? (previousLog.payload as Record<string, unknown>).eventFingerprints
    : null;
  const previousFingerprints: IcalEventFingerprint[] = Array.isArray(previousSnapshot)
    ? (previousSnapshot as IcalEventFingerprint[])
    : [];

  const { data: hotel, error: hotelError } = await client
    .from('hotels')
    .select('name')
    .eq('id', hotelId)
    .maybeSingle();
  if (hotelError) throw hotelError;

  // Outbound = the property's OWN bookings (direct + staff-created), matching
  // the feed route. Imported OTA blocks are intentionally NOT re-exported.
  const ownNights = await listOwnBookingNights(client, hotelId);
  const feed = buildOtaIcalFeed(
    ownNights.map((night) => ({
      hotel_id: night.hotel_id,
      room_type_id: night.room_type_id,
      date: night.date,
    })),
    { calendarName: hotel?.name || 'Property availability', hotelId },
  );

  const outbound = buildOutboundSyncFingerprints(previousFingerprints, feed);

  await logOtaSync(accessToken, {
    hotel_id: hotelId,
    provider: 'own_export',
    direction: 'outbound',
    action: 'export_calendar',
    status: 'success',
    payload: outbound,
    response: {
      message: 'Rebuilt outbound iCal feed after booking/block update',
      processedItemCount: outbound.processedItemCount,
      updatedItemCount: outbound.updatedItemCount,
    },
  });
}

/** Derives outbound fingerprints from a generated feed for snapshot diffing. */
export function buildOutboundSyncFingerprints(
  previous: IcalEventFingerprint[],
  feed: string,
): { processedItemCount: number; updatedItemCount: number; eventFingerprints: IcalEventFingerprint[] } {
  const current = parseIcalEventFingerprints(feed);
  return {
    processedItemCount: current.length,
    updatedItemCount: countUpdatedIcalItems(previous, current),
    eventFingerprints: current,
  };
}

