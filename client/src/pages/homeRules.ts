/**
 * Status pill variant for a row in the dashboard's "Recent bookings" table.
 * Same colours as the Bookings page: booked or in-house = live, stay finished = done,
 * cancelled/rejected = setup, anything else (waiting on payment or checks) = pending.
 */
export type StatusPillTone = 'live' | 'done' | 'setup' | 'pending';

export function recentBookingStatusTone(status: string): StatusPillTone {
  if (status === 'confirmed' || status === 'checked_in') return 'live';
  if (status === 'checked_out' || status === 'refunded') return 'done';
  if (status === 'cancelled' || status === 'expired' || status === 'payment_rejected') return 'setup';
  return 'pending';
}
