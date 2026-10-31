/**
 * Which rooms a staff member may pick for new dates in the booking wizard.
 *
 * Mirrors the server check in `server/d1/booking.ts` (`atomicInsert`): a room is
 * taken when a booking on that same room overlaps the stay (check-out exclusive)
 * and is confirmed, checked in, or still holding the room. The server stays the
 * authority; this only keeps the list honest.
 */

export interface WizardRoom { id: string; room_number: string; room_type_id: string; status: string }
export interface WizardBooking { id: string; room_id?: string | null; check_in: string; check_out: string; status: string }

// ASSUMPTION: the list does not carry `expires_at`, so a hold or a payment
// still awaiting verification blocks its room until the server expires it.
const ROOM_BLOCKING_STATUSES = new Set(['confirmed', 'checked_in', 'held', 'pending_payment', 'pending_verification']);

/** Rooms a guest can be put in. `rooms.status` is available | occupied | maintenance. */
export function availableRoomsForStay<R extends WizardRoom>(rooms: R[], bookings: WizardBooking[], checkInIso: string, checkOutIso: string): R[] {
  if (!checkInIso || !checkOutIso || checkInIso >= checkOutIso) return [];
  const takenRoomIds = new Set(
    bookings
      .filter(b => b.room_id && ROOM_BLOCKING_STATUSES.has(b.status) && b.check_in < checkOutIso && b.check_out > checkInIso)
      .map(b => b.room_id as string),
  );
  return rooms.filter(room => room.status !== 'maintenance' && room.status !== 'out_of_service' && !takenRoomIds.has(room.id));
}
