import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * T04-03 — Templated pre-arrival trigger (pure helper + manual trigger).
 *
 * Pure helper: getTemplatedMessageForBooking(booking) returns a day-before-check-in
 * reminder body if booking.check_in is tomorrow (vs today), else null. Handles
 * missing/invalid check_in gracefully (returns null). No I/O, no side effects —
 * suitable for unit testing and for use inside a cron/manual trigger.
 *
 * Manual trigger: triggerTemplatedPreArrivalMessages(client, opts) scans bookings
 * whose check_in is tomorrow and inserts a templated message into the thread for
 * each booking. Gracefully handles missing tables (42P01) by returning { sent: 0 }.
 *
 * Idempotency note: the pure helper is idempotent by design (same input → same
 * output, no mutation). Callers that persist the returned body (e.g. the manual
 * trigger) should deduplicate on (booking_id, date) before inserting — the trigger
 * below also checks for an existing templated message created today for the same
 * booking to avoid double-send if invoked twice on the same day.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplatedBookingInput = {
  id?: string;
  check_in?: string | null;
  guest_name?: string | null;
  hotel_id?: string;
};

// ---------------------------------------------------------------------------
// Date helpers (pure)
// ---------------------------------------------------------------------------

function todayIsoString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDays(isoDate: string, amount: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ---------------------------------------------------------------------------
// Pure helper (required by spec)
// ---------------------------------------------------------------------------

/** Build the reminder body for a qualifying booking. Internal helper — exported for testing clarity. */
export function buildPreArrivalReminderBody(booking: TemplatedBookingInput): string {
  const name = booking.guest_name?.trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const checkIn = booking.check_in ?? '';
  return (
    `${greeting} just a friendly reminder that your check-in is tomorrow (${checkIn}). ` +
    `We look forward to welcoming you! If you need anything before arrival, please let us know.`
  );
}

/**
 * Pure helper: returns the day-before-check-in reminder body if booking.check_in
 * is tomorrow (vs today), else null.
 *
 * @param booking - booking record with at least `check_in`; extra fields are ignored.
 * @param todayIso - optional override for "today" as YYYY-MM-DD (useful for tests); defaults to UTC today.
 */
export function getTemplatedMessageForBooking(
  booking: TemplatedBookingInput | null | undefined,
  todayIso?: string,
): string | null {
  if (!booking || typeof booking.check_in !== 'string' || !booking.check_in) return null;
  const checkIn = booking.check_in.trim();
  if (!isIsoDate(checkIn)) return null;

  const today = todayIso ?? todayIsoString();
  if (!isIsoDate(today)) return null;
  const tomorrow = addDays(today, 1);

  if (checkIn !== tomorrow) return null;
  return buildPreArrivalReminderBody({ ...booking, check_in: checkIn });
}

// ---------------------------------------------------------------------------
// Missing-table helper (42P01 grace)
// ---------------------------------------------------------------------------

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /(message_threads|messages|bookings).*(does not exist)/i.test(message);
}

// ---------------------------------------------------------------------------
// Manual trigger (DB-touching but graceful on missing tables)
// ---------------------------------------------------------------------------

export type TriggerResult = {
  sent: number;
  skipped: number;
  errors: number;
  tomorrow: string;
  today: string;
};

/**
 * Manual trigger: find bookings with check_in == tomorrow and insert a templated
 * message for each. Gracefully handles missing tables (42P01) by returning a
 * zero-sent result rather than throwing.
 *
 * Idempotency: before inserting for a booking, checks whether a templated message
 * for the same booking already exists today (by scanning recent messages for the
 * thread). If a message with the same templated body prefix already exists in the
 * last 24h window for that booking, the insert is skipped.
 *
 * Callers may pass `bookings` directly to avoid a DB round-trip; otherwise the
 * trigger queries `bookings` for `check_in == tomorrow` (scoped by hotelId when given).
 *
 * @param client - Supabase client (RLS-scoped recommended, but will grace on missing tables regardless)
 * @param opts.todayIso - override today as YYYY-MM-DD for testing
 * @param opts.hotelId - when provided, restrict to one hotel
 * @param opts.bookings - when provided, use these rows instead of querying
 */
export async function triggerTemplatedPreArrivalMessages(
  client: SupabaseClient,
  opts: { todayIso?: string; hotelId?: string; bookings?: TemplatedBookingInput[] } = {},
): Promise<TriggerResult> {
  const today = opts.todayIso ?? todayIsoString();
  const tomorrow = addDays(today, 1);

  // Gather candidate bookings
  let candidates: TemplatedBookingInput[];
  if (opts.bookings) {
    candidates = opts.bookings;
  } else {
    try {
      let query: any = client.from('bookings').select('id,hotel_id,guest_name,check_in').eq('check_in', tomorrow);
      if (opts.hotelId) query = query.eq('hotel_id', opts.hotelId);
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return { sent: 0, skipped: 0, errors: 0, tomorrow, today };
        throw error;
      }
      candidates = (data ?? []) as TemplatedBookingInput[];
    } catch (err) {
      if (isMissingTableError(err)) return { sent: 0, skipped: 0, errors: 0, tomorrow, today };
      if (err instanceof Error && /does not exist/i.test(err.message)) return { sent: 0, skipped: 0, errors: 0, tomorrow, today };
      throw err;
    }
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const booking of candidates) {
    const body = getTemplatedMessageForBooking(booking, today);
    if (!body) {
      skipped += 1;
      continue;
    }

    // Idempotency: try to avoid duplicate sends for same booking+day.
    // Best-effort check — if messages/thread tables are missing, gracefully skip.
    try {
      // For in-app messaging, each booking maps to a thread (message_threads.booking_id = booking.id).
      // We attempt to find an existing templated message for this booking created today.
      // If the messaging tables don't exist, this will 42P01 and we just proceed to insert (which will also 42P01 and be caught below).
      const bookingId = (booking as { id?: string }).id;
      if (bookingId) {
        try {
          const { data: existingThreads, error: threadError } = await (client as any)
            .from('message_threads')
            .select('id')
            .eq('booking_id', bookingId)
            .limit(1);
          if (threadError && isMissingTableError(threadError)) {
            // Tables not migrated — treat as idempotency check passed (no duplicate to skip)
          } else if (threadError) {
            // Non-table error — don't block send, keep going
          } else if (existingThreads && existingThreads.length > 0) {
            const threadId = (existingThreads[0] as { id: string }).id;
            const since = new Date(`${today}T00:00:00.000Z`).toISOString();
            const { data: recentMessages, error: msgError } = await (client as any)
              .from('messages')
              .select('id,body,created_at')
              .eq('thread_id', threadId)
              .gte('created_at', since)
              .limit(5);
            if (!msgError && recentMessages) {
              const alreadySent = (recentMessages as Array<{ body: string }>).some(m =>
                m.body.startsWith('Hi') && m.body.includes(`your check-in is tomorrow (${booking.check_in})`),
              );
              if (alreadySent) {
                skipped += 1;
                continue;
              }
            } else if (msgError && isMissingTableError(msgError)) {
              // ignore — tables missing
            }
          }
        } catch (e) {
          if (isMissingTableError(e)) {
            // tables missing — continue to insert attempt which will also grace
          } else {
            // ignore idempotency error, proceed to send
          }
        }
      }

      // Ensure thread exists (upsert by booking_id) — if table missing, will 42P01
      let threadId: string | null = null;
      const bookingId2 = (booking as { id?: string }).id;
      const hotelIdForThread = (booking as { hotel_id?: string }).hotel_id ?? opts.hotelId ?? null;
      if (bookingId2) {
        // Try to find or create thread for this booking
        try {
          const { data: found, error: findErr } = await (client as any)
            .from('message_threads')
            .select('id')
            .eq('booking_id', bookingId2)
            .maybeSingle();
          if (findErr && isMissingTableError(findErr)) throw findErr;
          if (findErr) throw findErr;
          if (found) {
            threadId = (found as { id: string }).id;
          } else {
            const { data: created, error: createErr } = await (client as any)
              .from('message_threads')
              .insert({ hotel_id: hotelIdForThread, booking_id: bookingId2 })
              .select('id')
              .single();
            if (createErr) {
              if (isMissingTableError(createErr)) throw createErr;
              throw createErr;
            }
            threadId = (created as { id: string }).id;
          }
        } catch (e) {
          if (isMissingTableError(e)) throw e;
          throw e;
        }
      } else {
        // No booking id — create a hotel-level thread if possible
        if (hotelIdForThread) {
          try {
            const { data: created, error: createErr } = await (client as any)
              .from('message_threads')
              .insert({ hotel_id: hotelIdForThread, booking_id: null })
              .select('id')
              .single();
            if (createErr) {
              if (isMissingTableError(createErr)) throw createErr;
              throw createErr;
            }
            threadId = (created as { id: string }).id;
          } catch (e) {
            if (isMissingTableError(e)) throw e;
            throw e;
          }
        }
      }

      if (!threadId) {
        // No thread could be resolved — count as skipped (not an error; likely missing ids)
        skipped += 1;
        continue;
      }

      const { error: msgInsertError } = await (client as any).from('messages').insert({
        thread_id: threadId,
        sender_user_id: null,
        body,
      });
      if (msgInsertError) {
        if (isMissingTableError(msgInsertError)) throw msgInsertError;
        throw msgInsertError;
      }
      sent += 1;
    } catch (err) {
      if (isMissingTableError(err)) {
        // Gracefully handle missing messaging tables — per spec 42P01 grace.
        // Return early with what we have; don't error the whole batch.
        // We treat this as zero more sent rather than failing callers.
        return { sent, skipped, errors, tomorrow, today };
      }
      if (err instanceof Error && /does not exist/i.test(err.message)) {
        return { sent, skipped, errors, tomorrow, today };
      }
      errors += 1;
    }
  }

  return { sent, skipped, errors, tomorrow, today };
}
