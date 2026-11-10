export type SiteConfig = {
  hotelId: string;
  theme: import("@shared/hotelThemes").HotelThemeId | null;
  heroCopy: string;
  visibleSections: {
    hero: boolean;
    story: boolean;
    rooms: boolean;
    booking: boolean;
    location: boolean;
  };
};

const DEFAULT_VISIBLE_SECTIONS: SiteConfig["visibleSections"] = {
  hero: true,
  story: true,
  rooms: true,
  booking: true,
  location: true,
};

export function defaultConfig(hotelId: string): SiteConfig {
  return {
    hotelId,
    theme: null,
    heroCopy: "Explore room types, rates, and availability directly from this hotel.",
    visibleSections: { ...DEFAULT_VISIBLE_SECTIONS },
  };
}


export function themeSaveErrorMessage(message: string, mediaPositionError: string): string {
  return message.includes("media_positions") ? mediaPositionError : message;
}

export const BUILDER_TABS = ["theme", "info", "photos", "publish"] as const;
export type BuilderTab = (typeof BUILDER_TABS)[number];

/**
 * Which tab gets focus after a key press on the tab list (WAI-ARIA tabs pattern).
 * Returns null for keys that do not move between tabs.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
