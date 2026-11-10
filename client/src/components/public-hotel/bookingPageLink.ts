/**
 * Links into the hayhost booking page (/:slug/book) and the query it understands:
 * ?roomType=<room type id>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 */

export type BookingPrefill = {
  roomTypeId: string | null;
  checkIn: string | null;
  checkOut: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30, 2026-1-5, ...). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The booking page of a hotel, optionally with one room type already picked. */
export function bookingPageHref(slug: string, roomTypeId?: string | null): string {
  const base = `/${encodeURIComponent(slug)}/book`;
  return roomTypeId ? `${base}?roomType=${encodeURIComponent(roomTypeId)}` : base;
}

/**
 * Reads the booking page query. Anything that does not fit is dropped instead of half-applied:
 * the dates come as a pair (both real days, check-in not before `today` in Thailand, check-out
 * after check-in) or not at all, and the room type must be one of the hotel's room types.
 */
export function parseBookingPrefill(
  search: string,
  context: { today: string; roomTypeIds: readonly string[] },
): BookingPrefill {
  const params = new URLSearchParams(search);
  const roomType = params.get("roomType")?.trim() ?? "";
  const checkIn = params.get("checkIn")?.trim() ?? "";
  const checkOut = params.get("checkOut")?.trim() ?? "";

  const datesFit =
    isCalendarDate(checkIn) &&
    isCalendarDate(checkOut) &&
    checkIn >= context.today &&
    checkOut > checkIn;

  return {
    roomTypeId: roomType && context.roomTypeIds.includes(roomType) ? roomType : null,
    checkIn: datesFit ? checkIn : null,
    checkOut: datesFit ? checkOut : null,
  };
}
