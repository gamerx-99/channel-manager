import { getSupportMemberships } from "./supportAccess";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { bookingStatusLog, bookings, hotelUsers, hotels, otaConnections, otaSyncLogs, roomTypes, rooms } from "../../drizzle/d1-schema";
import { buildIcalExport, parseIcalEvents, type IcalEvent } from "../icalFeed";
import { authorizeHotelAction, isD1SystemCallerContext, createD1SystemCallerContext, type D1CallerContext, type D1ScopedDatabase, type D1SystemCallerContext } from "../db/scope";
// Inlined from deleted ../otaSync
function buildIcalExportUrl(token: string): string {
  const base = (process.env.PUBLIC_APP_URL || "https://www.hayhostth.com").replace(/\/+$/, "");
  return `${base}/api/ical/${token}.ics`;
}
export type OtaConnectionRow = {
  id: string;
  hotel_id: string;
  provider: string;
  status: string;
  room_id: string | null;
  room_type_id: string | null;
  ical_import_url: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  ical_export_token: string;
};
export type OtaConnectionView = Omit<OtaConnectionRow, "ical_export_token"> & { ical_export_url: string | null };
export type OtaSyncLogSummary = {
  id?: string;
  hotel_id: string;
  provider: string;
  direction: "inbound" | "outbound";
  action: string;
  status: "success" | "failed";
  payload?: any;
  response?: any;
  error_message?: string;
  created_at?: string;
};
export function toOtaConnectionView(row: OtaConnectionRow, includeExportUrl: boolean): OtaConnectionView {
  const { ical_export_token: token, ...rest } = row as any;
  return { ...rest, ical_export_url: includeExportUrl && token ? buildIcalExportUrl(token) : null };
}
export function getUpdatedItemCount(log: { payload?: any; response?: any }): number {
  const sources = [log.response, log.payload];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    const readNonNegativeCount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
    const count = [record.updatedItemCount, record.updated_item_count, record.importedCount, record.imported_count]
      .map(readNonNegativeCount)
      .find((c): c is number => c !== null);
    if (count !== undefined) return count;
  }
  return 0;
}
import { ICAL_FETCH_ERROR, fetchPublicIcalFeed } from "./icalUrl";
import { getStayDates } from "@shared/stayDates";
import { addNightsStatement, isBookingNightsUniqueConflict, releaseExpiredHoldNightsStatement, releaseNightsStatement } from "./bookingNights";

const ACTIVE_HOLD_STATUSES = ["held", "pending_payment", "pending_verification"] as const;
const OCCUPYING_STATUSES = ["confirmed", "checked_in", ...ACTIVE_HOLD_STATUSES] as const;
const EXPORT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const MAX_SYNC_EVENTS = 5_000;

export type OtaSyncConflict = { uid: string; start: string; end: string };
export type OtaSkippedUid = { uid: string; booking_id: string; start: string; end: string };
export type OtaIcalSyncResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  conflicts: OtaSyncConflict[];
  skipped_uids: OtaSkippedUid[];
};

export async function fetchAndSyncOtaConnection(
  db: D1ScopedDatabase,
  systemCaller: D1SystemCallerContext,
  connectionId: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<OtaIcalSyncResult> {
  if (!isD1SystemCallerContext(systemCaller)) throw new TRPCError({ code: "FORBIDDEN", message: "A trusted system caller is required." });
  const [connection] = await db.select().from(otaConnections).where(eq(otaConnections.id, connectionId)).limit(1);
  if (!connection || connection.status === "disconnected") throw new TRPCError({ code: "NOT_FOUND", message: "OTA calendar connection not found." });
  try {
    if (!connection.icalImportUrl) throw new Error(ICAL_FETCH_ERROR);
    const body = await fetchPublicIcalFeed(connection.icalImportUrl, fetchImpl);
    return await syncOtaIcalBlocks(db, systemCaller, connectionId, parseIcalEvents(body), { skipUnchangedLog: true }, now);
  } catch {
    await recordSafeFetchFailure(db, connection, now);
    throw new Error(ICAL_FETCH_ERROR);
  }
}

async function recordSafeFetchFailure(
  db: D1ScopedDatabase,
  connection: typeof otaConnections.$inferSelect,
  now: Date,
) {
  await db.$client.batch([
    db.$client.prepare(`UPDATE ota_connections SET status = 'error', last_error = ?, updated_at = ?
      WHERE id = ? AND hotel_id = ? AND status <> 'disconnected'`)
      .bind(ICAL_FETCH_ERROR, now.getTime(), connection.id, connection.hotelId),
    db.$client.prepare(`INSERT INTO ota_sync_logs
      (id, hotel_id, provider, direction, action, status, payload, response, error_message)
      SELECT ?, ?, ?, 'inbound', 'sync_calendar', 'failed', ?, ?, ? WHERE changes() = 1`)
      .bind(crypto.randomUUID(), connection.hotelId, connection.provider,
        JSON.stringify({ connection_id: connection.id, syncType: "iCal blocked dates" }),
        JSON.stringify({ message: ICAL_FETCH_ERROR }), ICAL_FETCH_ERROR),
  ]);
}

function localToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, count: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isOccupying(row: { status: string; expiresAt: Date | null }, now: Date) {
  if (row.status === "confirmed" || row.status === "checked_in") return true;
  return ACTIVE_HOLD_STATUSES.includes(row.status as typeof ACTIVE_HOLD_STATUSES[number])
    && (row.expiresAt === null || row.expiresAt.getTime() >= now.getTime());
}

function validSystemOrHotelCaller(caller: D1CallerContext) {
  if (isD1SystemCallerContext(caller)) return true;
  if (caller.access === "system" || caller.access === "public" || !caller.userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A system caller or authorized hotel caller is required." });
  }
  return false;
}

/** D1 equivalent of the Postgres connection target trigger; the migration also installs SQLite triggers. */
export async function otaConnectionRoomSameHotel(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; room_id: string | null; room_type_id: string | null },
  now = new Date(),
) {
  const system = validSystemOrHotelCaller(caller);
  if (!system) await authorizeHotelAction(db, caller, input.hotel_id, "ota.manage_ical_connection", "ota.connection.target.validate", now);
  if (input.room_id !== null && input.room_type_id !== null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose either a room or a room type, not both." });
  }
  if (input.room_id !== null) {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, input.room_id), eq(rooms.hotelId, input.hotel_id))).limit(1);
    if (!room) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room does not belong to this hotel." });
  }
  if (input.room_type_id !== null) {
    const [roomType] = await db.select({ id: roomTypes.id }).from(roomTypes).where(and(eq(roomTypes.id, input.room_type_id), eq(roomTypes.hotelId, input.hotel_id))).limit(1);
    if (!roomType) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room type does not belong to this hotel." });
  }
  return true;
}

/** Reconcile parsed or raw iCal events into bookings. Network access and URL validation live in 13-06. */
export async function syncOtaIcalBlocks(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  connectionId: string,
  feed: string | readonly IcalEvent[],
  options: { skipUnchangedLog?: boolean } = {},
  now = new Date(),
): Promise<OtaIcalSyncResult> {
  const system = validSystemOrHotelCaller(caller);
  const [connection] = await db.select().from(otaConnections).where(eq(otaConnections.id, connectionId)).limit(1);
  if (!connection || connection.status === "disconnected") throw new TRPCError({ code: "NOT_FOUND", message: "OTA calendar connection not found." });
  if (!system) await authorizeHotelAction(db, caller, connection.hotelId, "ota.trigger_ical_sync", "ota.calendar.sync", now);

  let events: readonly IcalEvent[];
  if (typeof feed === "string") events = parseIcalEvents(feed);
  else events = feed;
  if (!Array.isArray(events) || events.length > MAX_SYNC_EVENTS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "iCal events must be an array of at most 5000 items." });
  }

  const roomIds = await getTargetRoomIds(db, connection.hotelId, connection.roomId, connection.roomTypeId);
  const today = localToday(now);
  const targetRoomIds = new Set(roomIds);
  const seenUids = new Set<string>();
  const result: OtaIcalSyncResult = { inserted: 0, updated: 0, unchanged: 0, cancelled: 0, conflicts: [], skipped_uids: [] };

  for (const raw of events) {
    if (!raw || typeof raw.uid !== "string" || typeof raw.start !== "string" || typeof raw.end !== "string") continue;
    const uid = raw.uid.trim().slice(0, 255);
    const start = raw.start;
    const end = raw.end;
    if (!uid || !isIsoDate(start) || !isIsoDate(end) || end <= start || end <= today || seenUids.has(uid)) continue;
    seenUids.add(uid);
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    const eventLabel = `${connection.provider}${summary ? ` · ${summary}` : ""}`.slice(0, 160);
    const [existing] = await db.select().from(bookings).where(and(
      eq(bookings.otaConnectionId, connection.id), eq(bookings.externalUid, uid),
    )).limit(1);

    if (existing && (existing.status === "checked_in" || existing.status === "checked_out"
      || (existing.status === "confirmed" && existing.checkIn === start && existing.checkOut === end && targetRoomIds.has(existing.roomId ?? "")))) {
      result.unchanged += 1;
      continue;
    }

    let isRevive = false;
    if (existing?.status === "cancelled") {
      const latestLog = await latestBookingStatusLog(db, existing.id);
      if (!latestLog || latestLog.toStatus !== "cancelled" || latestLog.changedBy !== null || latestLog.reason !== "ota_ical_removed_from_feed") {
        // ASSUMPTION: a legacy cancelled booking with no status log may have been cancelled by staff, so never resurrect it.
        result.skipped_uids.push({ uid, booking_id: existing.id, start, end });
        continue;
      }
      isRevive = true;
    }

    const candidates = existing?.roomId && targetRoomIds.has(existing.roomId)
      ? [existing.roomId, ...roomIds.filter(roomId => roomId !== existing.roomId)]
      : roomIds;
    let placed = false;
    for (const roomId of candidates) {
      if (existing) {
        const staleHoldCleanup = releaseExpiredHoldNightsStatement(db, { roomId }, now);
        // Persist lazy hold cleanup even if this candidate later loses the unique night key race.
        await db.$client.batch([staleHoldCleanup]);
        const update = db.$client.prepare(`UPDATE bookings
          SET check_in = ?, check_out = ?, room_id = ?, guest_name = ?, status = 'confirmed'
          WHERE id = ? AND hotel_id = ? AND ota_connection_id = ? AND external_uid = ? AND status = ?
            AND EXISTS (SELECT 1 FROM ota_connections c WHERE c.id = ? AND c.hotel_id = ? AND c.status <> 'disconnected')
            AND NOT EXISTS (
              SELECT 1 FROM bookings b WHERE b.room_id = ? AND b.id <> ?
                AND b.check_in < ? AND b.check_out > ?
                AND (b.status IN ('confirmed', 'checked_in') OR
                  (b.status IN ('held', 'pending_payment', 'pending_verification') AND (b.expires_at IS NULL OR b.expires_at >= ?)))
            )`)
          .bind(start, end, roomId, eventLabel, existing.id, connection.hotelId, connection.id, uid, existing.status, connection.id, connection.hotelId, roomId, existing.id, end, start, now.getTime());
        const statements = [
          releaseExpiredHoldNightsStatement(db, { roomId }, now),
          update,
        ];
        if (isRevive) statements.push(db.$client.prepare(`INSERT INTO booking_status_log
          (id, booking_id, from_status, to_status, changed_by, reason)
          SELECT ?, ?, 'cancelled', 'confirmed', NULL, 'ota_ical_restored' WHERE changes() = 1`)
          .bind(crypto.randomUUID(), existing.id));
        statements.push(
          db.$client.prepare(`DELETE FROM booking_nights
            WHERE booking_id = ?
              AND EXISTS (
                SELECT 1 FROM bookings
                WHERE id = ? AND check_in = ? AND check_out = ? AND room_id = ? AND status = 'confirmed'
              )`).bind(existing.id, existing.id, start, end, roomId),
          addNightsStatement(db, existing.id, getStayDates(start, end), now),
          releaseNightsStatement(db, existing.id, now),
        );
        let outcomes: Awaited<ReturnType<typeof db.$client.batch>>;
        try { outcomes = await db.$client.batch(statements); }
        catch (error) { if (isBookingNightsUniqueConflict(error)) continue; throw error; }
        if (outcomes[1]?.meta.changes === 1) {
          if (isRevive && outcomes[2]?.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTA restore audit was not written." });
          placed = true;
          result.updated += 1;
          break;
        }
      } else {
        const staleHoldCleanup = releaseExpiredHoldNightsStatement(db, { roomId }, now);
        // Persist lazy hold cleanup even if this candidate later loses the unique night key race.
        await db.$client.batch([staleHoldCleanup]);
        const bookingId = crypto.randomUUID();
        const insert = db.$client.prepare(`INSERT INTO bookings
          (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, ota_connection_id, external_uid)
          SELECT ?, ?, ?, ?, ?, ?, '0.00', 'ota_ical', 'confirmed', ?, ?
          FROM ota_connections c
          WHERE c.id = ? AND c.hotel_id = ? AND c.status <> 'disconnected'
            AND NOT EXISTS (
              SELECT 1 FROM bookings b WHERE b.room_id = ?
                AND b.check_in < ? AND b.check_out > ?
                AND (b.status IN ('confirmed', 'checked_in') OR
                  (b.status IN ('held', 'pending_payment', 'pending_verification') AND (b.expires_at IS NULL OR b.expires_at >= ?)))
            )
            AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.ota_connection_id = ? AND b.external_uid = ?)`)
          .bind(bookingId, connection.hotelId, roomId, eventLabel, start, end, connection.id, uid, connection.id, connection.hotelId, roomId, end, start, now.getTime(), connection.id, uid);
        let outcomes: Awaited<ReturnType<typeof db.$client.batch>>;
        try {
          outcomes = await db.$client.batch([
            releaseExpiredHoldNightsStatement(db, { roomId }, now),
            insert,
            addNightsStatement(db, bookingId, getStayDates(start, end), now),
            releaseNightsStatement(db, bookingId, now),
          ]);
        } catch (error) { if (isBookingNightsUniqueConflict(error)) continue; throw error; }
        const outcome = outcomes[1];
        if (outcome?.meta.changes === 1) {
          placed = true;
          result.inserted += 1;
          break;
        }
        // A concurrent sync may have inserted this UID after our lookup; treat an identical row as unchanged.
        const [concurrent] = await db.select().from(bookings).where(and(eq(bookings.otaConnectionId, connection.id), eq(bookings.externalUid, uid))).limit(1);
        if (concurrent?.status === "confirmed" && concurrent.checkIn === start && concurrent.checkOut === end && targetRoomIds.has(concurrent.roomId ?? "")) {
          result.unchanged += 1;
          placed = true;
          break;
        }
      }
    }
    if (!placed) result.conflicts.push({ uid, start, end });
  }

  const obsolete = await db.select({ id: bookings.id, status: bookings.status, roomId: bookings.roomId }).from(bookings).where(and(
    eq(bookings.hotelId, connection.hotelId), eq(bookings.otaConnectionId, connection.id),
    eq(bookings.status, "confirmed"), gt(bookings.checkOut, today),
  ));
  for (const row of obsolete) {
    const [booking] = await db.select({ id: bookings.id, externalUid: bookings.externalUid }).from(bookings).where(eq(bookings.id, row.id)).limit(1);
    if (!booking?.externalUid || seenUids.has(booking.externalUid)) continue;
    const outcomes = await db.$client.batch([
      releaseExpiredHoldNightsStatement(db, { roomId: row.roomId ?? "" }, now),
      db.$client.prepare(`UPDATE bookings SET status = 'cancelled'
        WHERE id = ? AND hotel_id = ? AND ota_connection_id = ? AND status = 'confirmed' AND check_out > ?`)
        .bind(row.id, connection.hotelId, connection.id, today),
      db.$client.prepare(`INSERT INTO booking_status_log (id, booking_id, from_status, to_status, changed_by, reason)
        SELECT ?, ?, 'confirmed', 'cancelled', NULL, 'ota_ical_removed_from_feed' WHERE changes() = 1`)
        .bind(crypto.randomUUID(), row.id),
      addNightsStatement(db, row.id, [], now),
      releaseNightsStatement(db, row.id, now),
    ]);
    const updated = outcomes[1]!;
    const audit = outcomes[2]!;
    if (updated?.meta.changes === 1) {
      if (audit?.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTA removal audit was not written." });
      result.cancelled += 1;
    }
  }

  await persistSyncResult(db, connection.hotelId, connection.provider, connection.id, events, result, options, now);
  return result;
}

async function getTargetRoomIds(db: D1ScopedDatabase, hotelId: string, roomId: string | null, roomTypeId: string | null) {
  if (roomId) {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.hotelId, hotelId))).limit(1);
    if (!room) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room does not belong to this hotel." });
    return [room.id];
  }
  if (roomTypeId) {
    const [roomType] = await db.select({ id: roomTypes.id }).from(roomTypes).where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.hotelId, hotelId))).limit(1);
    if (!roomType) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room type does not belong to this hotel." });
    const rows = await db.select({ id: rooms.id, roomNumber: rooms.roomNumber }).from(rooms).where(and(
      eq(rooms.hotelId, hotelId), eq(rooms.roomTypeId, roomTypeId), ne(rooms.status, "maintenance"),
    )).orderBy(asc(rooms.roomNumber));
    if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "This room type has no rooms that can be blocked." });
    return rows.map(row => row.id);
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the room or room type this calendar blocks before syncing." });
}

async function latestBookingStatusLog(db: D1ScopedDatabase, bookingId: string) {
  const [row] = await db.select({ toStatus: bookingStatusLog.toStatus, changedBy: bookingStatusLog.changedBy, reason: bookingStatusLog.reason })
    .from(bookingStatusLog).where(eq(bookingStatusLog.bookingId, bookingId))
    .orderBy(desc(bookingStatusLog.createdAt), desc(sql`rowid`)).limit(1);
  return row ?? null;
}

async function persistSyncResult(
  db: D1ScopedDatabase,
  hotelId: string,
  provider: string,
  connectionId: string,
  events: readonly IcalEvent[],
  result: OtaIcalSyncResult,
  options: { skipUnchangedLog?: boolean },
  now: Date,
) {
  const conflictCount = result.conflicts.length;
  const updatedItemCount = result.inserted + result.updated + result.cancelled;
  const payload = { connection_id: connectionId, feed_fingerprint: "", syncType: "iCal blocked dates", processedItemCount: events.length, updatedItemCount, ...result };
  const response = {
    message: conflictCount > 0 ? `${conflictCount} event(s) from ${provider} overlap existing bookings on this room` : `Successfully synchronized iCal calendar with ${provider}`,
    processedItemCount: events.length,
    updatedItemCount,
    conflictCount,
    skippedUids: result.skipped_uids,
  };
  const fingerprint = await feedFingerprint(events);
  payload.feed_fingerprint = fingerprint;
  const recentLogs = await db.select({ payload: otaSyncLogs.payload, response: otaSyncLogs.response })
    .from(otaSyncLogs).where(and(eq(otaSyncLogs.hotelId, hotelId), eq(otaSyncLogs.provider, provider), eq(otaSyncLogs.direction, "inbound"), eq(otaSyncLogs.action, "sync_calendar")))
    .orderBy(desc(otaSyncLogs.createdAt)).limit(50);
  const duplicate = recentLogs.some(row => {
    const oldPayload = row.payload as Record<string, unknown> | null;
    return oldPayload?.connection_id === connectionId && oldPayload?.feed_fingerprint === fingerprint;
  });
  const skipLog = duplicate || (options.skipUnchangedLog === true && updatedItemCount === 0 && conflictCount === 0 && result.skipped_uids.length === 0);
  const statements = [db.$client.prepare(`UPDATE ota_connections
      SET last_sync_at = ?, updated_at = ?, status = ?, last_error = ?
      WHERE id = ? AND hotel_id = ? AND status <> 'disconnected'`)
    .bind(now.getTime(), now.getTime(), conflictCount > 0 ? "conflict" : "connected", conflictCount > 0 ? `${conflictCount} OTA event(s) overlap existing bookings on this room.` : null, connectionId, hotelId)];
  if (!skipLog) statements.push(db.$client.prepare(`INSERT INTO ota_sync_logs
      (id, hotel_id, provider, direction, action, status, payload, response)
      SELECT ?, ?, ?, 'inbound', 'sync_calendar', 'success', ?, ? WHERE changes() = 1`)
    .bind(crypto.randomUUID(), hotelId, provider, JSON.stringify(payload), JSON.stringify(response)));
  const outcomes = await db.$client.batch(statements);
  if (outcomes[0]?.meta.changes !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "OTA calendar connection is no longer active." });
  if (!skipLog && outcomes[1]?.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTA sync result was not logged." });
}

async function feedFingerprint(events: readonly IcalEvent[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(events));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Token-gated D1 equivalent of get_ota_ical_export, rendered as an RFC 5545 calendar. */
export async function getOtaIcalExport(db: D1ScopedDatabase, caller: D1CallerContext, exportToken: string, now = new Date()): Promise<string | null> {
  if (caller.access === "system" && !isD1SystemCallerContext(caller)) throw new TRPCError({ code: "FORBIDDEN" });
  if (!EXPORT_TOKEN_PATTERN.test(exportToken)) return null;
  const [connection] = await db.select({
    id: otaConnections.id, hotelId: otaConnections.hotelId, roomId: otaConnections.roomId, roomTypeId: otaConnections.roomTypeId,
    hotelName: hotels.name, roomNumber: rooms.roomNumber, roomTypeName: roomTypes.name,
  }).from(otaConnections).innerJoin(hotels, eq(otaConnections.hotelId, hotels.id))
    .leftJoin(rooms, eq(otaConnections.roomId, rooms.id)).leftJoin(roomTypes, eq(otaConnections.roomTypeId, roomTypes.id))
    .where(and(eq(otaConnections.icalExportToken, exportToken), ne(otaConnections.status, "disconnected"))).limit(1);
  if (!connection) return null;
  const today = localToday(now);
  const events: Array<{ uid: string; start: string; end: string }> = [];
  let calendarName = connection.hotelName;

  if (connection.roomTypeId) {
    calendarName = `${connection.hotelName} · ${connection.roomTypeName ?? ""}`;
    const typeRooms = await db.select({ id: rooms.id }).from(rooms).where(and(
      eq(rooms.hotelId, connection.hotelId), eq(rooms.roomTypeId, connection.roomTypeId), ne(rooms.status, "maintenance"),
    ));
    if (typeRooms.length) {
      const roomIds = typeRooms.map(row => row.id);
      const rangeEnd = addDays(today, 366);
      const bookingRows = await db.select({ roomId: bookings.roomId, checkIn: bookings.checkIn, checkOut: bookings.checkOut, status: bookings.status, expiresAt: bookings.expiresAt })
        .from(bookings).where(and(inArray(bookings.roomId, roomIds), lt(bookings.checkIn, rangeEnd), gt(bookings.checkOut, today), inArray(bookings.status, OCCUPYING_STATUSES)));
      const bookedRoomByDate = new Map<string, Set<string>>();
      for (const row of bookingRows) {
        if (!row.roomId || !isOccupying(row, now)) continue;
        const first = row.checkIn < today ? today : row.checkIn;
        const lastExclusive = row.checkOut > rangeEnd ? rangeEnd : row.checkOut;
        for (let date = first; date < lastExclusive; date = addDays(date, 1)) {
          const roomsForDate = bookedRoomByDate.get(date) ?? new Set<string>();
          roomsForDate.add(row.roomId);
          bookedRoomByDate.set(date, roomsForDate);
        }
      }
      const fullDates: string[] = [];
      for (let date = today; date <= addDays(today, 365); date = addDays(date, 1)) {
        if ((bookedRoomByDate.get(date)?.size ?? 0) >= typeRooms.length) fullDates.push(date);
      }
      let runStart: string | null = null;
      let prior: string | null = null;
      for (const date of fullDates) {
        if (prior && date !== addDays(prior, 1)) {
          events.push({ uid: `${connection.id}-${runStart!.replace(/-/g, "")}`, start: runStart!, end: addDays(prior, 1) });
          runStart = null;
        }
        if (!runStart) runStart = date;
        prior = date;
      }
      if (runStart && prior) events.push({ uid: `${connection.id}-${runStart.replace(/-/g, "")}`, start: runStart, end: addDays(prior, 1) });
    }
  } else if (connection.roomId) {
    calendarName = `${connection.hotelName}${connection.roomNumber ? ` · ${connection.roomNumber}` : ""}`;
    const rangeEnd = addDays(today, 730);
    const rows = await db.select({ id: bookings.id, checkIn: bookings.checkIn, checkOut: bookings.checkOut, status: bookings.status, expiresAt: bookings.expiresAt })
      .from(bookings).where(and(
        eq(bookings.roomId, connection.roomId), gt(bookings.checkOut, addDays(today, -1)), lt(bookings.checkIn, addDays(rangeEnd, 1)),
        or(isNull(bookings.otaConnectionId), ne(bookings.otaConnectionId, connection.id)), inArray(bookings.status, OCCUPYING_STATUSES),
      )).orderBy(asc(bookings.checkIn));
    for (const row of rows) if (isOccupying(row, now)) events.push({ uid: row.id, start: row.checkIn, end: row.checkOut });
  }

  return buildIcalExport({ calendarName, events, now });
}

function dbRowToOtaRow(row: any): OtaConnectionRow {
  return {
    id: row.id,
    hotel_id: row.hotelId,
    provider: row.provider,
    status: row.status,
    room_id: row.roomId ?? null,
    room_type_id: row.roomTypeId ?? null,
    ical_import_url: row.icalImportUrl ?? null,
    last_sync_at: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
    last_error: row.lastError ?? null,
    ical_export_token: row.icalExportToken,
  };
}

function dbLogToSummary(row: any) {
  return {
    id: row.id,
    hotel_id: row.hotelId,
    provider: row.provider,
    direction: row.direction,
    action: row.action,
    status: row.status,
    payload: row.payload ? (() => { try { return JSON.parse(row.payload); } catch { return null; } })() : null,
    response: row.response ? (() => { try { return JSON.parse(row.response); } catch { return null; } })() : null,
    error_message: row.errorMessage ?? null,
    created_at: new Date(row.createdAt).toISOString(),
  };
}

export async function listOtaConnections(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  options: { includeExportUrl?: boolean } = {},
): Promise<OtaConnectionView[]> {
  await authorizeHotelAction(db, caller, hotelId, "ota.view_status", "ota.connections.list", new Date());
  const rows = await db.select().from(otaConnections).where(eq(otaConnections.hotelId, hotelId)).orderBy(asc(otaConnections.provider));
  return rows.map((row: any) => toOtaConnectionView(dbRowToOtaRow(row), Boolean(options.includeExportUrl)));
}

export async function upsertOtaConnection(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: {
    hotelId: string;
    provider: string;
    status: string;
    icalImportUrl?: string;
    roomId?: string | null;
    roomTypeId?: string | null;
    includeExportUrl?: boolean;
  },
): Promise<OtaConnectionView> {
  await authorizeHotelAction(db, caller, input.hotelId, "ota.manage_ical_connection", "ota.connections.upsert", new Date());
  await otaConnectionRoomSameHotel(db, caller, {
    hotel_id: input.hotelId,
    room_id: input.roomId ?? null,
    room_type_id: input.roomTypeId ?? null,
  });

  let roomIdVal: string | null | undefined;
  let roomTypeIdVal: string | null | undefined;
  if (input.roomTypeId) {
    roomIdVal = null;
    roomTypeIdVal = input.roomTypeId;
  } else if (input.roomId !== undefined) {
    roomIdVal = input.roomId ?? null;
    roomTypeIdVal = null;
  }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const now = new Date();

  const values: any = {
    id: crypto.randomUUID(),
    hotelId: input.hotelId,
    provider: input.provider,
    status: input.status,
    icalImportUrl: input.icalImportUrl ?? null,
    icalExportToken: token,
    updatedAt: now,
    createdAt: now,
  };
  if (roomIdVal !== undefined) values.roomId = roomIdVal;
  if (roomTypeIdVal !== undefined) values.roomTypeId = roomTypeIdVal;

  const setObj: any = {
    status: input.status,
    icalImportUrl: input.icalImportUrl ?? null,
    updatedAt: now,
  };
  if (roomIdVal !== undefined) setObj.roomId = roomIdVal;
  if (roomTypeIdVal !== undefined) setObj.roomTypeId = roomTypeIdVal;

  await db.insert(otaConnections).values(values).onConflictDoUpdate({
    target: [otaConnections.hotelId, otaConnections.provider],
    set: setObj,
  });

  const [row] = await db.select().from(otaConnections).where(and(eq(otaConnections.hotelId, input.hotelId), eq(otaConnections.provider, input.provider))).limit(1);
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTA connection was not persisted." });
  return toOtaConnectionView(dbRowToOtaRow(row), Boolean(input.includeExportUrl));
}

export async function deleteOtaConnection(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  provider: string,
): Promise<void> {
  await authorizeHotelAction(db, caller, hotelId, "ota.manage_ical_connection", "ota.connections.delete", new Date());
  await db.delete(otaConnections).where(and(eq(otaConnections.hotelId, hotelId), eq(otaConnections.provider, provider)));
}

export async function listOtaSyncLogs(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  limit = 50,
) {
  await authorizeHotelAction(db, caller, hotelId, "ota.view_sync_logs", "ota.logs.list", new Date());
  const rows = await db.select().from(otaSyncLogs).where(eq(otaSyncLogs.hotelId, hotelId)).orderBy(desc(otaSyncLogs.createdAt)).limit(limit);
  return rows.map((row: any) => dbLogToSummary(row));
}

export async function triggerOtaCalendarSyncD1(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  provider: string,
) {
  await authorizeHotelAction(db, caller, hotelId, "ota.trigger_ical_sync", "ota.calendar.trigger", new Date());
  const [connection] = await db.select().from(otaConnections).where(and(eq(otaConnections.hotelId, hotelId), eq(otaConnections.provider, provider))).limit(1);
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: `No iCal import URL is configured for ${provider}.` });
  const systemCaller = createD1SystemCallerContext();
  const result = await fetchAndSyncOtaConnection(db, systemCaller, connection.id);
  return {
    success: true,
    updatedItemCount: result.inserted + result.updated + result.cancelled,
    conflictCount: result.conflicts.length,
    conflicts: result.conflicts,
    response: { message: result.conflicts.length > 0 ? `${result.conflicts.length} event(s) from ${connection.provider} overlap existing bookings on this room` : `Successfully synchronized iCal calendar with ${connection.provider}` },
  };
}

export async function getOtaSummary(db: D1ScopedDatabase, caller: D1CallerContext) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "FORBIDDEN" });
  const memberships = await db.select({ hotelId: hotelUsers.hotelId, role: hotelUsers.role }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  if (caller.roles?.includes("super_admin") || memberships.some(row => row.role === "super_admin")) throw new TRPCError({ code: "FORBIDDEN" });
  const supportIdentity = caller.roles?.includes("support") || memberships.some(row => row.role === "support");
  const candidates = supportIdentity ? await getSupportMemberships(db, caller) : memberships;
  const ids: string[] = [];
  for (const { hotelId } of candidates) {
    try {
      await authorizeHotelAction(db, caller, hotelId, "ota.view_status", "ota.summary.read");
      await authorizeHotelAction(db, caller, hotelId, "ota.view_sync_logs", "ota.summary.logs");
      ids.push(hotelId);
    } catch (error) {
      if (error instanceof TRPCError && error.code === "FORBIDDEN") continue;
      throw error;
    }
  }
  if (!ids.length) return [];
  const hotelRows = await db.select({ id: hotels.id, name: hotels.name }).from(hotels).where(inArray(hotels.id, ids));

  const output: any[] = [];
  for (const hotel of hotelRows) {
    const connections = await db.select().from(otaConnections).where(eq(otaConnections.hotelId, hotel.id)).orderBy(asc(otaConnections.provider));
    for (const conn of connections) {
      const logs = await db.select().from(otaSyncLogs).where(and(eq(otaSyncLogs.hotelId, hotel.id), eq(otaSyncLogs.provider, conn.provider))).orderBy(desc(otaSyncLogs.createdAt)).limit(5);
      const recentUpdatedItemCount = logs
        .filter((l: any) => l.action === "sync_calendar" && l.status === "success")
        .reduce((total: number, l: any) => total + getUpdatedItemCount(dbLogToSummary(l) as any), 0);
      const latestLog = logs.length > 0 ? dbLogToSummary(logs[0]) : null;
      output.push({
        id: conn.id,
        hotel_id: conn.hotelId,
        provider: conn.provider,
        status: conn.status,
        room_id: conn.roomId ?? null,
        room_type_id: conn.roomTypeId ?? null,
        last_sync_at: conn.lastSyncAt ? new Date(conn.lastSyncAt).toISOString() : null,
        last_error: conn.lastError ?? null,
        hotel_name: hotel.name || "Property",
        latest_log: latestLog,
        recent_updated_item_count: recentUpdatedItemCount,
        recent_synced_count: recentUpdatedItemCount,
      });
    }
  }
  return output;
}
