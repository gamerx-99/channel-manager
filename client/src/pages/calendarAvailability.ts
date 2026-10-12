import { isBookingOccupyingInventory, type BookingStatus } from '@shared/bookingLifecycle';

export type CalendarRoom = { id: string; room_type_id: string };
export type CalendarBooking = {
  room_id: string | null;
  check_in: string;
  check_out: string;
  status: BookingStatus;
  expires_at: string | null;
};
export type OtaImportedBlock = {
  room_type_id: string;
  date: string;
};

/**
 * Counts rooms blocked by imported OTA iCal events for one room type / night.
 * Several OTA reservations may block the same room type on the same night
 * (one row per source event), so the count — not a boolean — is subtracted
 * from sellable inventory.
 */
export function getOtaBlockedRoomCountForDate(
  roomTypeId: string,
  date: string,
  blocks: Array<{ room_type_id: string; date: string }>,
): number {
  return blocks.filter(block => block.room_type_id === roomTypeId && block.date === date).length;
}

export function getBookedRoomCountForDate(
  roomTypeId: string,
  date: string,
  rooms: CalendarRoom[],
  bookings: CalendarBooking[],
): number {
  const roomTypeById = new Map(rooms.map(room => [room.id, room.room_type_id]));
  const bookedRoomIds = new Set(bookings.filter(booking =>
    booking.room_id !== null &&
    roomTypeById.get(booking.room_id) === roomTypeId &&
    booking.check_in <= date &&
    booking.check_out > date &&
    isBookingOccupyingInventory(booking),
  ).map(booking => booking.room_id));
  return bookedRoomIds.size;
}

export function getAvailableRoomCount(
  totalRooms: number,
  allotment: number,
  bookedRooms: number,
  otaBlockedRooms = 0,
): number {
  return Math.max(0, Math.min(totalRooms, allotment) - bookedRooms - otaBlockedRooms);
}
