import React, { useEffect } from "react";
import type { usePublicHotelPage } from "@/components/public-hotel/usePublicHotelPage";
import { getContrastText } from "@/lib/contrastText";

export type ThemeLayoutProps = Omit<ReturnType<typeof usePublicHotelPage>, "booking"> & {
  booking: React.ReactNode;
  setLanguage: (language: "en" | "th") => void;
  isVisible: (key: string) => boolean;
};

export type ThemeLandingProps = {
  themeId: "minimal-white" | "lanna-teak" | "cafe-homestay";
  hotelName: string;
  accentColor: string;
  children: React.ReactNode;
};

const fonts: Record<ThemeLandingProps["themeId"], string> = {
  "minimal-white": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  "lanna-teak": "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Serif+Thai:wght@400;500;600;700&family=Noto+Serif:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
  "cafe-homestay": "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Epilogue:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
};

export function ThemeLanding({ themeId, accentColor, children }: ThemeLandingProps) {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-hotel-theme-font="${themeId}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fonts[themeId];
    link.dataset.hotelThemeFont = themeId;
    document.head.appendChild(link);
  }, [themeId]);

  return <div className={`public-page theme-${themeId}`} style={{ "--owner-accent": accentColor, "--owner-accent-text": getContrastText(accentColor) } as React.CSSProperties}>{children}</div>;
}
