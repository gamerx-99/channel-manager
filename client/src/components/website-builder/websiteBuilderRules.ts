export type SiteConfig = {
  hotelId: string;
  theme: import("@shared/hotelThemes").HotelThemeId | null;
  heroCopy: string;
  accentColor: string;
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
    accentColor: "#1d6b56",
    visibleSections: { ...DEFAULT_VISIBLE_SECTIONS },
  };
}

export function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function themeSaveErrorMessage(message: string, mediaPositionError: string): string {
  return message.includes("media_positions") ? mediaPositionError : message;
}
