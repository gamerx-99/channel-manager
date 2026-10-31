import { isBookingOccupyingInventory, type BookingStatus } from '@shared/bookingLifecycle';

export type CalendarRoom = { id: string; room_type_id: string };
export type CalendarBooking = {
  roomId: string | null;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  expiresAt: string | null;
  source?: string;
  guestName?: string | null;
};

export function getBookedRoomCountForDate(
  roomTypeId: string,
  date: string,
  rooms: CalendarRoom[],
  bookings: CalendarBooking[],
): number {
  const roomTypeById = new Map(rooms.map(room => [room.id, room.room_type_id]));
  const bookedRoomIds = new Set(bookings.filter(booking =>
    booking.roomId !== null &&
    roomTypeById.get(booking.roomId) === roomTypeId &&
    booking.checkIn <= date &&
    booking.checkOut > date &&
    isBookingOccupyingInventory(booking),
  ).map(booking => booking.roomId));
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
    booking.roomId !== null &&
    roomTypeById.get(booking.roomId) === roomTypeId &&
    booking.checkIn <= date &&
    booking.checkOut > date &&
    isBookingOccupyingInventory(booking),
  );
}

export function getBookingPlatform(booking: CalendarBooking): string {
  if (booking.source === 'ota_ical') {
    return booking.guestName?.split(' · ')[0]?.trim() || 'OTA';
  }
  return booking.source || 'Booking';
}
