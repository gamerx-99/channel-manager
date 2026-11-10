import type React from "react";
import type { usePublicHotelPage } from "@/components/public-hotel/usePublicHotelPage";
import type { HotelThemeId } from "@shared/hotelThemes";

export type ThemeLandingProps = Omit<ReturnType<typeof usePublicHotelPage>, "booking" | "accentColor" | "accentTextColor" | "highlightColor"> & {
  themeId: HotelThemeId;
  hotelName: string;
  rooms: ReturnType<typeof usePublicHotelPage>["roomTypes"];
  photos: ReturnType<typeof usePublicHotelPage>["media"];
  bookingLink: (roomTypeId?: string) => string;
  contacts: React.ReactNode;
  map: React.ReactNode;
  colours: { buttonBackground: string; buttonText: string; highlight: string };
  locationMap: React.ReactNode;
  setLanguage: (language: "en" | "th") => void;
  isVisible: (key: string) => boolean;
};
