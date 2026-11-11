import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import { hotelGuestPrivacy } from "@/lib/hotelGuestPrivacy";

/** A hotel's privacy notice for guests, at /:slug/privacy. Only published hotels have one. */
export function useHotelPrivacy(slug: string) {
  const { t, language } = useTranslation();
  const query = trpc.channelManager.publicHotel.useQuery(slug, {
    retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2,
    refetchOnWindowFocus: false,
  });
  const hotel = query.data?.hotel ?? null;
  const document = hotel ? hotelGuestPrivacy(language === "th" ? "th" : "en", hotel) : null;
  usePageMeta(hotel ? { title: t("hotelPrivacy.title", { hotel: hotel.name }), description: t("hotelPrivacy.title", { hotel: hotel.name }) } : null);
  return { t, hotel, document, loading: query.isLoading, failed: Boolean(query.error) };
}
