import React, { useEffect } from "react";
import type { usePublicHotelPage } from "@/components/public-hotel/usePublicHotelPage";
import type { ThemeLandingProps as SharedThemeLandingProps } from "./ThemeProps";
import type { HotelThemeId } from "@shared/hotelThemes";
import { getHotelThemeColors } from "@shared/hotelThemes";

// Themes do not embed the booking steps: their book buttons open the hayhost booking page (/:slug/book).
export type ThemeLayoutProps = Omit<ReturnType<typeof usePublicHotelPage>, "booking" | "accentColor" | "accentTextColor" | "highlightColor"> & {
  contacts?: React.ReactNode;
  locationMap?: React.ReactNode;
  setLanguage: (language: "en" | "th") => void;
  isVisible: (key: string) => boolean;
};

export type ThemeLandingProps = {
  themeId: HotelThemeId;
  hotelName: string;
  children: React.ReactNode;
  colors?: SharedThemeLandingProps["colours"];
};

const fonts: Partial<Record<ThemeLandingProps["themeId"], string>> = {
  "minimal-white": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  "lanna-teak": "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Serif+Thai:wght@400;500;600;700&family=Noto+Serif:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
  "cafe-homestay": "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Epilogue:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
  "mountain-mist": "https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700&family=Prompt:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
  "boutique-noir": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Taviraj:wght@400;500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Bai+Jamjuree:wght@400;500;600;700&display=swap",
  // Kanit supplies Thai script alongside the two Latin display families.
  "riverside-calm": "https://fonts.googleapis.com/css2?family=Pridi:wght@400;500;600;700&family=Noto+Serif:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap",
  "vintage-old-town": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Prompt:wght@400;500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
  "hostel-pop": "https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=Kanit:wght@400;500;600;700;800;900&display=swap",
};

export function ThemeLanding({ themeId, children, colors }: ThemeLandingProps) {
  const resolvedColors = colors ?? getHotelThemeColors(themeId);
  useEffect(() => {
    const font = fonts[themeId];
    if (!font) return;
    const existing = document.querySelector<HTMLLinkElement>(`link[data-hotel-theme-font="${themeId}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = font;
    link.dataset.hotelThemeFont = themeId;
    document.head.appendChild(link);
  }, [themeId]);

  return <div className={`public-page theme-${themeId}`} style={{ "--owner-accent": resolvedColors.buttonBackground, "--owner-accent-text": resolvedColors.buttonText, "--owner-highlight": resolvedColors.highlight } as React.CSSProperties}>{children}</div>;
}
