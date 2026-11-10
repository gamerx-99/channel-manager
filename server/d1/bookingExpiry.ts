import type { D1ScopedDatabase } from "../db/scope";

/** Runs from the worker cron. Expired requests release their inventory even if no guest revisits the page. */
export async function expireOutstandingBookingRequests(db: D1ScopedDatabase, now = new Date()) {
  const cutoff = now.getTime();
  const eligible = "status IN ('held', 'pending_payment', 'pending_verification') AND expires_at IS NOT NULL AND expires_at < ?";
  const results = await db.$client.batch([
    db.$client.prepare(`INSERT INTO booking_status_log (id, booking_id, from_status, to_status, reason)
      SELECT lower(hex(randomblob(16))), id, status, 'expired', 'timer_expired'
      FROM bookings WHERE ${eligible}`).bind(cutoff),
    db.$client.prepare(`UPDATE bookings SET status = 'expired' WHERE ${eligible}`).bind(cutoff),
    db.$client.prepare(`DELETE FROM booking_nights WHERE booking_id IN
      (SELECT id FROM bookings WHERE (status = 'expired' AND expires_at IS NOT NULL AND expires_at < ?) OR status = 'payment_rejected')`)
      .bind(cutoff),
  ]);
  return { expired: results[1]?.meta.changes ?? 0 };
}
