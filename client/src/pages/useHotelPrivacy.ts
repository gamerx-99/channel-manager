import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import { hotelGuestPrivacy } from "@/lib/hotelGuestPrivacy";
import { hotelBookingTerms } from "@/lib/hotelBookingTerms";

export type HotelGuestDocumentKind = "privacy" | "booking-terms";

/** A hotel's guest-facing document: its privacy notice (/:slug/privacy) or booking conditions (/:slug/booking-terms). Only published hotels have them. */
export function useHotelPrivacy(slug: string, kind: HotelGuestDocumentKind = "privacy") {
  const { t, language } = useTranslation();
  const query = trpc.channelManager.publicHotel.useQuery(slug, {
    retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2,
    refetchOnWindowFocus: false,
  });
  const hotel = query.data?.hotel ?? null;
  const lang = language === "th" ? "th" : "en";
  const document = hotel ? (kind === "booking-terms" ? hotelBookingTerms(lang, hotel, slug) : hotelGuestPrivacy(lang, hotel)) : null;
  const titleKey = kind === "booking-terms" ? "hotelPrivacy.bookingTermsTitle" : "hotelPrivacy.title";
  usePageMeta(hotel ? { title: t(titleKey, { hotel: hotel.name }), description: t(titleKey, { hotel: hotel.name }) } : null);
  return { t, hotel, document, titleKey, loading: query.isLoading, failed: Boolean(query.error) };
}
