import React from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import { useBookingWizard } from "./useBookingWizard";
import { getHotelThemeColors } from "@shared/hotelThemes";

export const DEFAULT_HERO_COPY = "เลือกห้องพัก ดูราคา และตรวจสอบวันว่างได้ที่นี่";

export function usePublicHotelPage(slug: string) {
  const { t, language, setLanguage, toggleLanguage } = useTranslation();

  // A private or unknown hotel answers NOT_FOUND at once; retrying it only kept
  // guests looking at a loading screen.
  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug, {
    retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
    staleTime: 30 * 60 * 1000,
  });
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
    staleTime: 30 * 60 * 1000,
  });

  const booking = useBookingWizard({
    slug,
    t,
    roomTypes: publicHotel.data?.roomTypes,
    visibleSections: (siteConfigQuery.data?.visibleSections as Record<string, boolean> | null) ?? null,
    hotelReady: !publicHotel.isLoading && !publicHotel.error,
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

  if (!publicHotel.data) {
    const defaultColors = getHotelThemeColors(null);
    return { hotel: null, roomTypes: [], media: [], heroImage: undefined, siteConfig: null, accentColor: defaultColors.buttonBackground, accentTextColor: defaultColors.buttonText, highlightColor: defaultColors.highlight, visibleSections: null, heroCopy: t("publicHotel.defaultHeroCopy"), language: undefined, t, loading, error, notFound, refetch: publicHotel.refetch, booking: null };
  }
  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;

  // hotel_site_config fallback: when no config row or table missing, use fixed copy/colors
  const siteConfig = siteConfigQuery.data ?? null;
  const heroCopy = siteConfig?.heroCopy ?? DEFAULT_HERO_COPY;
  const displayHeroCopy = siteConfig?.heroCopy?.trim() ? heroCopy : t("publicHotel.defaultHeroCopy");
  const themeColors = getHotelThemeColors(siteConfig?.theme);
  const accentColor = themeColors.buttonBackground;
  const visibleSections = (siteConfig?.visibleSections as Record<string, boolean> | null) ?? null;
  const isVisible = (key: string) => visibleSections?.[key] !== false;

  return {
    hotel, roomTypes, media, heroImage, siteConfig, accentColor, accentTextColor: themeColors.buttonText, highlightColor: themeColors.highlight, visibleSections, heroCopy: displayHeroCopy,
    language, setLanguage, toggleLanguage, t, loading, error, notFound, refetch: publicHotel.refetch,
    isVisible,
    booking,
  };
}
