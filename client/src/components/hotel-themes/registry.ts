import type { ComponentType } from "react";
import type { HotelThemeId } from "@shared/hotelThemes";
import MinimalWhiteLanding from "./minimal-white/MinimalWhite";
import LannaTeakLanding from "./lanna-teak/LannaTeak";
import CafeHomestayLanding from "./cafe-homestay/CafeHomestay";
import MountainMistLanding from "./mountain-mist/MountainMist";
import BoutiqueNoirLanding from "./boutique-noir/BoutiqueNoir";
import HostelPopLanding from "./hostel-pop/HostelPop";
import RiversideCalmLanding from "./riverside-calm/RiversideCalm";
import VintageOldTownLanding from "./vintage-old-town/VintageOldTown";
import type { ThemeLandingProps } from "./ThemeProps";
import type { CSSProperties } from "react";

export type TemplateCardPreviewProps = { theme: HotelThemeId; hotelName: string; photo: string | null; objectPosition?: string | null };
export type HotelThemeRegistryEntry = { landing: ComponentType<ThemeLandingProps>; previewStyle: CSSProperties };

export const HOTEL_THEME_REGISTRY: Record<HotelThemeId, HotelThemeRegistryEntry> = {
  "minimal-white": { landing: MinimalWhiteLanding, previewStyle: { "--preview-bg": "#f9f9f7", "--preview-surface": "#fff", "--preview-ink": "#1a1c1b", "--preview-muted": "#656962", "--preview-accent": "#52604b" } as CSSProperties },
  "lanna-teak": { landing: LannaTeakLanding, previewStyle: { "--preview-bg": "#fff8f5", "--preview-surface": "#f0dfd5", "--preview-ink": "#2a211b", "--preview-muted": "#76675f", "--preview-accent": "#41240d" } as CSSProperties },
  "cafe-homestay": { landing: CafeHomestayLanding, previewStyle: { "--preview-bg": "#fff8f0", "--preview-surface": "#f2dfc9", "--preview-ink": "#321f12", "--preview-muted": "#7a573d", "--preview-accent": "#a66b4f" } as CSSProperties },
  "mountain-mist": { landing: MountainMistLanding, previewStyle: { "--preview-bg": "#f5fbf8", "--preview-surface": "#e9efec", "--preview-ink": "#171d1b", "--preview-muted": "#424844", "--preview-accent": "#e0a458" } as CSSProperties },
  "boutique-noir": { landing: BoutiqueNoirLanding, previewStyle: { "--preview-bg": "#131313", "--preview-surface": "#201f1f", "--preview-ink": "#e5e2e1", "--preview-muted": "#9a8f81", "--preview-accent": "#b8955a" } as CSSProperties },
  "hostel-pop": { landing: HostelPopLanding, previewStyle: { "--preview-bg": "#ffd23f", "--preview-surface": "#ffffff", "--preview-ink": "#1b1b1b", "--preview-muted": "#4d4634", "--preview-accent": "#fd5c8e" } as CSSProperties },
  "vintage-old-town": { landing: VintageOldTownLanding, previewStyle: { "--preview-bg": "#fff8f5", "--preview-surface": "#f6ece5", "--preview-ink": "#1f1b17", "--preview-muted": "#57423b", "--preview-accent": "#c2562e" } as CSSProperties },
  "riverside-calm": { landing: RiversideCalmLanding, previewStyle: { "--preview-bg": "#f3faff", "--preview-surface": "#def1fa", "--preview-ink": "#0c1e24", "--preview-muted": "#3f4849", "--preview-accent": "#0d575a" } as CSSProperties },
};

export function getHotelThemeRegistryEntry(themeId: unknown): HotelThemeRegistryEntry | undefined {
  return typeof themeId === "string" && Object.prototype.hasOwnProperty.call(HOTEL_THEME_REGISTRY, themeId)
    ? HOTEL_THEME_REGISTRY[themeId as HotelThemeId]
    : undefined;
}

export function getHotelThemeLanding(themeId: unknown, defaultLanding: ComponentType<any>) {
  return getHotelThemeRegistryEntry(themeId)?.landing ?? defaultLanding;
}
