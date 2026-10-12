import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError, throwOnError } from './utils';

export type OtaImportBlockRecord = {
  hotel_id: string;
  provider: string;
  room_type_id: string;
  date: string;
  source_uid: string;
  created_at: string;
};

/**
 * Statuses that occupy sellable inventory when exported to OTAs or checked
 * against imported OTA blocks (anything that can still become, or already
 * is, a real stay).
 */
export const OTA_INVENTORY_OCCUPYING_STATUSES = [
  'held',
  'pending_payment',
  'pending_verification',
  'confirmed',
  'checked_in',
] as const;

const COLUMNS = 'hotel_id,provider,room_type_id,date,source_uid,created_at';

export type OwnBookingNight = {
  booking_id: string;
  hotel_id: string;
  room_type_id: string;
  date: string;
};

/**
 * Reads every currently-blocked room type / night for a hotel. RLS-scoped.
 * Gracefully returns [] when the ota_import_blocks migration has not been
 * applied yet (42P01 undefined_table / PGRST205 schema-cache miss).
 */
export async function listOtaImportBlocks(
  client: SupabaseClient,
  hotelId: string,
): Promise<OtaImportBlockRecord[]> {
  try {
    const { data, error } = await client
      .from('ota_import_blocks')
      .select(COLUMNS)
      .eq('hotel_id', hotelId);
    if (error) {
      if (isMissingTableError('ota_import_blocks', error)) return [];
      throw error;
    }
    return (data ?? []) as OtaImportBlockRecord[];
  } catch (err) {
    if (isMissingTableError('ota_import_blocks', err)) return [];
    throw err;
  }
}

/**
 * Reads this hotel's own bookings that occupy sellable inventory so the
 * outbound iCal feed can close the matching dates on the OTA side. Runs on
 * the service-role admin client (the feed route uses it) because the public
 * feed has no user session; callers filter out stale held/pending rows via
 * expires_at, mirroring holdRoomType's lazy expiry sweep.
 */
export async function listOwnBookingNights(
  client: SupabaseClient,
  hotelId: string,
): Promise<OwnBookingNight[]> {
  const { data: rooms, error: roomsError } = await client
    .from('rooms')
    .select('id,room_type_id')
    .eq('hotel_id', hotelId);
  if (roomsError) throw roomsError;

  const roomTypeByRoomId = new Map<string, string>();
  for (const room of (rooms ?? []) as Array<{ id: string; room_type_id: string }>) {
    if (room?.id && room?.room_type_id) roomTypeByRoomId.set(room.id, room.room_type_id);
  }
  if (roomTypeByRoomId.size === 0) return [];

  const { data: bookings, error: bookingsError } = await client
    .from('bookings')
    .select('id,room_id,check_in,check_out,status,expires_at')
    .eq('hotel_id', hotelId)
    .in('status', [...OTA_INVENTORY_OCCUPYING_STATUSES]);
  if (bookingsError) throw bookingsError;

  const nights: OwnBookingNight[] = [];
  for (const booking of (bookings ?? []) as Array<{
    id: string;
    room_id: string | null;
    check_in: string;
    check_out: string;
    status: string;
    expires_at: string | null;
  }>) {
    const roomTypeId = booking?.room_id ? roomTypeByRoomId.get(booking.room_id) : undefined;
    if (!roomTypeId) continue;
    // Lazy expiry: a held/pending row past expires_at no longer occupies inventory.
    if (
      (booking.status === 'held' ||
        booking.status === 'pending_payment' ||
        booking.status === 'pending_verification') &&
      booking.expires_at !== null &&
      Date.parse(booking.expires_at) <= Date.now()
    ) {
      continue;
    }
    for (const date of expandStayNights(booking.check_in, booking.check_out)) {
      nights.push({ booking_id: booking.id, hotel_id: hotelId, room_type_id: roomTypeId, date });
    }
  }
  return nights;
}

/** Expands a half-open [checkIn, checkOut) stay into its YYYY-MM-DD nights. */
function expandStayNights(checkIn: string, checkOut: string): string[] {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const dates: string[] = [];
  const current = new Date(start);
  while (current.getTime() < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Replaces the stored block set for one hotel/provider inside the caller's
 * transaction-free batch: delete rows for events missing from the current
 * snapshot (cancellation / shortening -> nights re-open), then insert new
 * (provider, room_type, date) rows.
 */

/**
 * Resolves the room types of a hotel whose normalized name matches any of the
 * supplied feed summaries (case-insensitive). Returns a Map of
 * `lowercase summary -> room_type_id` for events that matched, plus the
 * unmatched summaries so callers can log them. RLS-scoped.
 */
export async function resolveRoomTypesBySummary(
  client: SupabaseClient,
  hotelId: string,
  summaries: string[],
): Promise<{ bySummary: Map<string, string>; unmatched: string[] }> {
  const uniqueSummaries = Array.from(
    new Set(summaries.map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );
  const bySummary = new Map<string, string>();
  if (uniqueSummaries.length === 0) return { bySummary, unmatched: [] };

  const { data, error } = await client
    .from('room_types')
    .select('id,name')
    .eq('hotel_id', hotelId);
  if (error) throw error;

  const normalize = (value: string) => value.trim().toLowerCase();
  const byName = new Map<string, string>();
  for (const row of data ?? []) {
    const name = typeof row.name === 'string' ? row.name : '';
    if (name) byName.set(normalize(name), row.id as string);
  }
  const unmatched: string[] = [];
  for (const summary of uniqueSummaries) {
    const roomTypeId = byName.get(summary);
    if (roomTypeId) bySummary.set(summary, roomTypeId);
    else unmatched.push(summary);
  }
  return { bySummary, unmatched };
}

export async function replaceOtaImportBlocks(
  client: SupabaseClient,
  hotelId: string,
  provider: string,
  removed: Array<{ room_type_id: string; date: string; source_uid: string }>,
  added: Array<{ room_type_id: string; date: string; source_uid: string }>,
): Promise<{ deleted: number; inserted: number }> {
  let deleted = 0;

  for (const item of removed) {
    const { error, count } = await client
      .from('ota_import_blocks')
      .delete()
      .eq('hotel_id', hotelId)
      .eq('provider', provider)
      .eq('room_type_id', item.room_type_id)
      .eq('date', item.date)
      .select('room_type_id');
    throwOnError(error);
    deleted += count ?? 0;
  }

  for (const item of added) {
    const { error } = await client.from('ota_import_blocks').insert({
      hotel_id: hotelId,
      provider,
      room_type_id: item.room_type_id,
      date: item.date,
      source_uid: item.source_uid,
    });
    // 23505 = unique_violation: the row already exists (duplicate VEVENT for
    // the same night), which is equivalent to the desired state. Skip it.
    if (error && (error as { code?: string }).code === '23505') continue;
    throwOnError(error);
  }

  return { deleted, inserted: added.length };
}
