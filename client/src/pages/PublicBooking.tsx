import React from "react";
import { Link } from "wouter";
import "@/components/public-hotel/public-hotel.css";
import "@/components/public-hotel/public-booking-page.css";
import "@/components/public-hotel/booking-themes.css";
import { useHotelThemeFont } from "@/components/hotel-themes/ThemeLanding";
import PublicBookingSection from "@/components/public-hotel/PublicBookingSection";
import { usePublicBookingPage } from "@/components/public-hotel/usePublicBookingPage";

export default function PublicBooking({ slug }: { slug: string }) {
  const data = usePublicBookingPage(slug);
  useHotelThemeFont(data.bookingTheme);
  const { t } = data;
  if (data.loading) return <div className="public-page"><main className="public-loading" role="status" aria-live="polite">{t("publicHotel.loadingHotelDetails")}</main></div>;
  if (data.notFound || (!data.error && !data.hotel)) return <div className="public-page"><main className="public-loading" data-testid="public-booking-not-found"><h1>{t("publicHotel.hotelUnavailableTitle")}</h1><p>{t("publicHotel.hotelUnavailableDesc")}</p><div className="public-state-actions"><Link className="button public-button" href="/">{t("publicHotel.goHome")}</Link></div></main></div>;
  if (data.error || !data.hotel) return <div className="public-page"><main className="public-loading" role="alert" data-testid="public-booking-load-error"><h1>{t("publicHotel.loadErrorTitle")}</h1><p>{t("publicHotel.loadErrorDesc")}</p><button type="button" className="button public-button" onClick={() => void data.refetch?.()}>{t("publicHotel.tryAgain")}</button></main></div>;
  const { hotel, accentColor, accentTextColor, highlightColor, hotelHref, language, setLanguage, bookingTheme } = data;

  return (
    <div
      className="public-page booking-page"
      data-booking-theme={bookingTheme ?? "default"}
      style={{ "--booking-page-accent": accentColor, "--booking-page-accent-text": accentTextColor, "--booking-page-highlight": highlightColor } as React.CSSProperties}
    >
      <header className="booking-page-header">
        <a className="booking-page-hotel" href={hotelHref}>{hotel.name}</a>
        <div className="booking-page-language" role="group" aria-label={t("publicBooking.language")}>
          <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
        </div>
      </header>
      <main className="booking-page-main">
        {data.prefillReady && <PublicBookingSection page={data} />}
      </main>
      <footer className="booking-page-footer">
        <span>{hotel.name}</span>
        <a className="booking-page-hayhost-link" href="https://www.hayhostth.com/" target="_blank" rel="noopener">
          <img src="/logo-wide.png" alt={t("publicBooking.footerLogoAlt")} />
        </a>
      </footer>
    </div>
  );
}
