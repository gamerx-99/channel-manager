import { isBookingOccupyingInventory, type BookingStatus } from '@shared/bookingLifecycle';

export type CalendarRoom = { id: string; room_type_id: string };
export type CalendarBooking = {
  room_id: string | null;
  check_in: string;
  check_out: string;
  status: BookingStatus;
  expires_at: string | null;
  source?: string;
  guest_name?: string | null;
};

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
): number {
  return Math.max(0, Math.min(totalRooms, allotment) - bookedRooms);
}

export function getBookingsForRoomTypeAndDate(
  roomTypeId: string,
  date: string,
  rooms: CalendarRoom[],
  bookings: CalendarBooking[],
): CalendarBooking[] {
  const roomTypeById = new Map(rooms.map(room => [room.id, room.room_type_id]));
  return bookings.filter(booking =>
    booking.room_id !== null &&
    roomTypeById.get(booking.room_id) === roomTypeId &&
    booking.check_in <= date &&
    booking.check_out > date &&
    isBookingOccupyingInventory(booking),
  );
}

export function getBookingPlatform(booking: CalendarBooking): string {
  if (booking.source === 'ota_ical') {
    return booking.guest_name?.split(' · ')[0]?.trim() || 'OTA';
  }
  return booking.source || 'Booking';
}
