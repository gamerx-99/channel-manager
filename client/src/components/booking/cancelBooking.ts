import { ALLOWED_TRANSITIONS, type BookingStatus } from "@shared/bookingLifecycle";

export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

/** Same rule as the server: held, awaiting-payment and confirmed bookings can be cancelled. */
export function canCancelBooking(status: string): boolean {
  return (ALLOWED_TRANSITIONS[status as BookingStatus] ?? []).includes("cancelled");
}

/** Owner decision 2026-11-11 (sheet 5.3): a cancellation needs a reason of 3 to 500 characters. */
export function isCancelReasonValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= CANCEL_REASON_MIN && length <= CANCEL_REASON_MAX;
}
