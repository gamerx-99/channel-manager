import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { usePublicHotelPage } from "./usePublicHotelPage";
import { getTodayDateString } from "./useBookingWizard";
import { parseBookingPrefill } from "./bookingPageLink";
import { isHotelThemeId } from "@shared/hotelThemes";

/**
 * Data for the themed booking page (/:slug/book). The booking steps are the existing wizard from
 * usePublicHotelPage; this hook only fills it once from ?roomType=&checkIn=&checkOut=.
 */
export function usePublicBookingPage(slug: string) {
  const page = usePublicHotelPage(slug);
  const search = useSearch();
  const prefilledHotelId = useRef<string | null>(null);
  // The date picker reads its dates only when it mounts, so the booking steps wait until the
  // query has been applied (one render after the hotel loads) and then mount with those dates.
  const [prefillReadyFor, setPrefillReadyFor] = useState<string | null>(null);
  const hotelId = page.hotel?.id ?? null;
  const { booking, roomTypes } = page;

  useEffect(() => {
    if (!hotelId || !booking || prefilledHotelId.current === hotelId) return;
    prefilledHotelId.current = hotelId;
    setPrefillReadyFor(hotelId);
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
    bookingTheme: isHotelThemeId(page.siteConfig?.theme) ? page.siteConfig.theme : null,
    accentTextColor: page.accentTextColor,
    hotelHref: `/${slug}`,
    prefillReady: hotelId !== null && prefillReadyFor === hotelId,
  };
}
