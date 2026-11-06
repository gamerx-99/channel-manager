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
