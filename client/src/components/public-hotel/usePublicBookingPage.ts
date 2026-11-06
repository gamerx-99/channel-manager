import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { getContrastText } from "@/lib/contrastText";
import { usePublicHotelPage } from "./usePublicHotelPage";
import { getTodayDateString } from "./useBookingWizard";
import { parseBookingPrefill } from "./bookingPageLink";

/**
 * Data for the hayhost booking page (/:slug/book). Every hotel gets the same layout; only the
 * hotel name and its accent colour change. The booking steps are the existing wizard from
 * usePublicHotelPage; this hook only fills it once from ?roomType=&checkIn=&checkOut=.
 */
export function usePublicBookingPage(slug: string) {
  const page = usePublicHotelPage(slug);
  const search = useSearch();
  const prefilledHotelId = useRef<string | null>(null);
  const hotelId = page.hotel?.id ?? null;
  const { booking, roomTypes } = page;

  useEffect(() => {
    if (!hotelId || !booking || prefilledHotelId.current === hotelId) return;
    prefilledHotelId.current = hotelId;
    const prefill = parseBookingPrefill(search, {
      today: getTodayDateString(),
      roomTypeIds: roomTypes.map((room: { id: string }) => room.id),
    });
    if (prefill.checkIn && prefill.checkOut) {
      booking.setCheckIn(prefill.checkIn);
      booking.setCheckOut(prefill.checkOut);
    }
    if (prefill.roomTypeId) booking.setPreferredRoomTypeId(prefill.roomTypeId);
  }, [hotelId, booking, roomTypes, search]);

  return {
    ...page,
    accentTextColor: getContrastText(page.accentColor),
    hotelHref: `/${slug}`,
  };
}
