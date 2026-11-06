import { getContrastText } from "@/lib/contrastText";
import { usePublicHotelPage } from "./usePublicHotelPage";

/**
 * Data for the hayhost booking page (/:slug/book). Every hotel gets the same layout; only the
 * hotel name and its accent colour change, so this hook only adds what that layout needs.
 */
export function usePublicBookingPage(slug: string) {
  const page = usePublicHotelPage(slug);
  return {
    ...page,
    accentTextColor: getContrastText(page.accentColor),
    hotelHref: `/${slug}`,
  };
}
