/**
 * Public landing-page themes (spec 16). Visual references live in design/themes/<NN-name>/ in the
 * orchestrator checkout; they are rebuilt here in React, never pasted.
 * ASSUMPTION: the theme is chosen by `?theme=<id>` until hotel_site_config gets a stored field
 * (after the 13-08 cutover). Unknown or missing ids render the default PublicHotel page.
 */
export const HOTEL_THEME_IDS = ["minimal-white", "lanna-teak", "cafe-homestay"] as const;
export type HotelThemeId = typeof HOTEL_THEME_IDS[number];

type HotelThemeDefinition = {
  /** One Google Fonts stylesheet with the Latin fonts plus a Thai font that has Thai glyphs. */
  fontHref: string;
  /** Default primary colour; a hotel's own accent_color overrides it. */
  primary: string;
};

export const HOTEL_THEMES: Record<HotelThemeId, HotelThemeDefinition> = {
  "minimal-white": {
    fontHref: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Sans+Thai:wght@300;400;500&display=swap",
    primary: "#52604b",
  },
  "lanna-teak": {
    fontHref: "https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,600;1,400&family=Noto+Serif+Thai:wght@400;600&family=Be+Vietnam+Pro:wght@300;400;500;600&family=Noto+Sans+Thai:wght@300;400;500;600&display=swap",
    primary: "#5b3a21",
  },
  "cafe-homestay": {
    fontHref: "https://fonts.googleapis.com/css2?family=Epilogue:wght@500;700;800&family=Be+Vietnam+Pro:wght@400;500;600&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap",
    primary: "#4a3426",
  },
};

export function resolveHotelTheme(search: string): HotelThemeId | null {
  const requested = new URLSearchParams(search).get("theme");
  return (HOTEL_THEME_IDS as readonly string[]).includes(requested ?? "") ? requested as HotelThemeId : null;
}
