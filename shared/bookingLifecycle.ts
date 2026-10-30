export type BookingStatus =
  | 'held'
  | 'pending_payment'
  | 'pending_verification'
  | 'confirmed'
  | 'expired'
  | 'payment_rejected'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'checked_in'
  | 'checked_out';

export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  held: ['pending_payment', 'expired', 'cancelled'],
  pending_payment: ['pending_verification', 'expired', 'cancelled'],
  pending_verification: ['confirmed', 'payment_rejected'],
  payment_rejected: ['pending_verification', 'expired'],
  confirmed: ['cancelled', 'checked_in'],
  checked_in: ['checked_out'],
  checked_out: [],
  expired: [],
  cancelled: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

export function assertValidTransition(from: BookingStatus, to: BookingStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid booking status transition: ${from} -> ${to}`);
  }
}

export function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return Date.now() > new Date(expiresAt).getTime();
}

export function isBookingOccupyingInventory(booking: {
  status: BookingStatus;
  expires_at?: string | null;
  expiresAt?: string | null;
}): boolean {
  const expiresAt = booking.expires_at ?? booking.expiresAt ?? null;
  if (booking.status === 'confirmed' || booking.status === 'checked_in') {
    return true;
  }
  if (
    booking.status === 'held' ||
    booking.status === 'pending_payment' ||
    booking.status === 'pending_verification'
  ) {
    return !isExpired(expiresAt);
  }
  return false;
}
