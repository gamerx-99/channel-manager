import React from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import { useBookingWizard } from "./useBookingWizard";

export const DEFAULT_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_ACCENT_COLOR = "#954831";

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDayAfterTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export function usePublicHotelPage(slug: string) {
  const { t, language, setLanguage, toggleLanguage } = useTranslation();

  // A private or unknown hotel answers NOT_FOUND at once; retrying it only kept
  // guests looking at a loading screen.
  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug, {
    retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2,
  });
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
  });

  const booking = useBookingWizard({
    slug,
    t,
    roomTypes: publicHotel.data?.roomTypes,
    visibleSections: (siteConfigQuery.data?.visibleSections as Record<string, boolean> | null) ?? null,
  });

  const loading = publicHotel.isLoading;
  const notFound = publicHotel.error?.data?.code === "NOT_FOUND";
  const error = publicHotel.error;
  const metaHotel = publicHotel.data?.hotel;
  usePageMeta(metaHotel
    ? {
        title: t("publicHotel.metaTitle", { name: metaHotel.name }),
        description: siteConfigQuery.data?.heroCopy?.trim() || t("publicHotel.metaDescription", { name: metaHotel.name, address: metaHotel.address }),
      }
    : notFound ? { title: t("publicHotel.hotelUnavailableTitle"), description: t("publicHotel.hotelUnavailableDesc"), noindex: true } : null);

  if (!publicHotel.data) return { hotel: null, roomTypes: [], media: [], heroImage: undefined, siteConfig: null, accentColor: DEFAULT_ACCENT_COLOR, visibleSections: null, heroCopy: DEFAULT_HERO_COPY, language: undefined, t, loading, error, notFound, refetch: publicHotel.refetch, booking: null };
  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;

  // hotel_site_config fallback: when no config row or table missing, use fixed copy/colors
  const siteConfig = siteConfigQuery.data ?? null;
  const heroCopy = siteConfig?.heroCopy ?? DEFAULT_HERO_COPY;
  const accentColor = siteConfig?.accentColor ?? DEFAULT_ACCENT_COLOR;
  const visibleSections = (siteConfig?.visibleSections as Record<string, boolean> | null) ?? null;
  const isVisible = (key: string) => visibleSections?.[key] !== false;

  return {
    hotel, roomTypes, media, heroImage, siteConfig, accentColor, visibleSections, heroCopy,
    language, setLanguage, toggleLanguage, t, loading, error, notFound, refetch: publicHotel.refetch,
    isVisible,
    booking,
  };
}