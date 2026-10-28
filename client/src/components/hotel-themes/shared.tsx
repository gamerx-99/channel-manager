import { useEffect } from "react";
import type React from "react";
import { useTranslation } from "@/lib/i18n";

export type ThemeHotel = { name: string; slug: string; address: string };
export type ThemeRoomType = {
  id: string;
  name: string;
  capacity: number;
  base_price: number | string;
  child_rule?: string | null;
  child_rule_limit?: number | string | null;
};
export type ThemeMedia = { url: string; caption?: string | null; is_hero?: boolean | null };

/** Everything a theme landing may render: only data the hotel itself provided (spec 16 data rules). */
export type HotelThemeLandingProps = {
  slug: string;
  hotel: ThemeHotel;
  roomTypes: ThemeRoomType[];
  media: ThemeMedia[];
  heroCopy: string | null;
  primary: string;
  showBooking: boolean;
};

/** Adds the theme's font stylesheet while the theme is mounted. */
export function useThemeFonts(href: string) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.hotelThemeFont = "true";
    document.head.appendChild(link);
    return () => link.remove();
  }, [href]);
}

/** Hero first, then up to 8 gallery photos; room photos reuse the gallery order like the default page. */
export function splitThemeMedia(media: ThemeMedia[]) {
  const hero = media.find(item => item.is_hero) ?? media[0] ?? null;
  const gallery = media.filter(item => item !== hero).slice(0, 8);
  return { hero, gallery };
}

export function lowestRoomPrice(roomTypes: ThemeRoomType[]) {
  const prices = roomTypes.map(room => Number(room.base_price)).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}

export function formatBaht(value: number | string) {
  return `฿${Number(value).toLocaleString()}`;
}

/** Map without an API key: Google's public embed of the hotel's own address. */
export function ThemeMap({ address, className }: { address: string; className?: string }) {
  const { t } = useTranslation();
  if (!address.trim()) return null;
  return (
    <iframe
      className={className}
      title={t("publicHotel.themeMapTitle")}
      src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

export function ThemeLanguageSwitch({ className }: { className?: string }) {
  const { language, setLanguage } = useTranslation();
  const option = (code: "th" | "en", label: string) => (
    <button type="button" aria-pressed={language === code} onClick={() => setLanguage(code)}>{label}</button>
  );
  return <div className={className}>{option("th", "TH")}<span aria-hidden="true">|</span>{option("en", "EN")}</div>;
}

/** CSS custom properties are not in React's style typings. */
export function themeVars(vars: Record<string, string>): React.CSSProperties {
  return vars as React.CSSProperties;
}
