import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { bookingStatusLog, bookings, hotels, otaConnections, otaSyncLogs, roomTypes, rooms } from "../../drizzle/d1-schema";
import { buildIcalExport, parseIcalEvents, type IcalEvent } from "../icalFeed";
import { authorizeHotelAction, isD1SystemCallerContext, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

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
        const statements = [update];
        if (isRevive) statements.push(db.$client.prepare(`INSERT INTO booking_status_log
          (id, booking_id, from_status, to_status, changed_by, reason)
          SELECT ?, ?, 'cancelled', 'confirmed', NULL, 'ota_ical_restored' WHERE changes() = 1`)
          .bind(crypto.randomUUID(), existing.id));
        const outcomes = await db.$client.batch(statements);
        if (outcomes[0]?.meta.changes === 1) {
          if (isRevive && outcomes[1]?.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OTA restore audit was not written." });
          placed = true;
          result.updated += 1;
          break;
        }
      } else {
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
          .bind(crypto.randomUUID(), connection.hotelId, roomId, eventLabel, start, end, connection.id, uid, connection.id, connection.hotelId, roomId, end, start, now.getTime(), connection.id, uid);
        const [outcome] = await db.$client.batch([insert]);
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

  const obsolete = await db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(and(
    eq(bookings.hotelId, connection.hotelId), eq(bookings.otaConnectionId, connection.id),
    eq(bookings.status, "confirmed"), gt(bookings.checkOut, today),
  ));
  for (const row of obsolete) {
    const [booking] = await db.select({ id: bookings.id, externalUid: bookings.externalUid }).from(bookings).where(eq(bookings.id, row.id)).limit(1);
    if (!booking?.externalUid || seenUids.has(booking.externalUid)) continue;
    const [updated, audit] = await db.$client.batch([
      db.$client.prepare(`UPDATE bookings SET status = 'cancelled'
        WHERE id = ? AND hotel_id = ? AND ota_connection_id = ? AND status = 'confirmed' AND check_out > ?`)
        .bind(row.id, connection.hotelId, connection.id, today),
      db.$client.prepare(`INSERT INTO booking_status_log (id, booking_id, from_status, to_status, changed_by, reason)
        SELECT ?, ?, 'confirmed', 'cancelled', NULL, 'ota_ical_removed_from_feed' WHERE changes() = 1`)
        .bind(crypto.randomUUID(), row.id),
    ]);
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
