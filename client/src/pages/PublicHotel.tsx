import { ArrowRight, MapPin, Menu, X } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import PublicBookingSection from "@/components/public-hotel/PublicBookingSection";
import { useTranslation } from "@/lib/i18n";
import MinimalWhiteLanding from "@/components/hotel-themes/MinimalWhiteLanding";
import LannaTeakLanding from "@/components/hotel-themes/LannaTeakLanding";
import CafeHomestayLanding from "@/components/hotel-themes/CafeHomestayLanding";
import "@/components/hotel-themes/themes.css";
import { isHotelThemeId } from "@shared/hotelThemes";
import { usePublicHotelPage } from "@/components/public-hotel/usePublicHotelPage";

export default function PublicHotel({ slug }: { slug: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const data = usePublicHotelPage(slug);
  const { t } = data;
  if (data.loading) return <div className="public-page"><main className="public-loading" role="status" aria-live="polite">{t("publicHotel.loadingHotelDetails")}</main></div>;
  if (data.notFound || (!data.error && !data.hotel)) return <div className="public-page"><main className="public-loading" data-testid="public-hotel-not-found"><h1>{t("publicHotel.hotelUnavailableTitle")}</h1><p>{t("publicHotel.hotelUnavailableDesc")}</p><div className="public-state-actions"><Link className="button public-button" href="/">{t("publicHotel.goHome")}</Link><Link className="button button-quiet" href="/login">{t("publicHotel.hotelSignIn")}</Link></div></main></div>;
  if (data.error || !data.hotel) return <div className="public-page"><main className="public-loading" role="alert" data-testid="public-hotel-load-error"><h1>{t("publicHotel.loadErrorTitle")}</h1><p>{t("publicHotel.loadErrorDesc")}</p><button type="button" className="button public-button" onClick={() => void data.refetch?.()}>{t("publicHotel.tryAgain")}</button></main></div>;
  const { hotel, roomTypes, media, heroImage, accentColor, heroCopy, booking } = data;
  const isVisible = booking!.isVisible;
  const handleSelectRoom = booking!.handleSelectRoom;
  const selectedTheme = isHotelThemeId(data.siteConfig?.theme) ? data.siteConfig.theme : null;
  const themed = (content: React.ReactNode) => {
    if (selectedTheme === "minimal-white") return <MinimalWhiteLanding hotelName={hotel.name} accentColor={accentColor}>{content}</MinimalWhiteLanding>;
    if (selectedTheme === "lanna-teak") return <LannaTeakLanding {...data} hotelName={hotel.name} accentColor={accentColor} booking={<PublicBookingSection page={data} />} />;
    if (selectedTheme === "cafe-homestay") return <CafeHomestayLanding {...data} hotelName={hotel.name} accentColor={accentColor} booking={<PublicBookingSection page={data} />} />;
    return content;
  };
  const page = (
    <div className="public-page">
      <header className="public-nav">
        {selectedTheme ? <a className="theme-hotel-name" href={`/${hotel.slug}`}>{hotel.name}</a> : <Link href={`/${hotel.slug}`} className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></Link>}
        <nav className={menuOpen ? "is-open" : ""}>
          <a href="#stay">{t("publicHotel.navRooms")}</a>
          <a href="#location">{t("publicHotel.navLocation")}</a>
          <a href="#book" className="public-nav-cta" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>{t("publicHotel.navCheckDates")} <ArrowRight size={14} /></a>
        </nav>
        <button className="public-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("publicHotel.menuToggleAria")}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </header>
      <main>
        <section className="public-hero">
          {heroImage ? <img src={heroImage} alt={hotel.name} /> : <div className="public-hero-image-fallback" aria-hidden="true" />}
          <div className="public-hero-overlay" />
          <div className="public-hero-content">
            <div className="eyebrow light">{t("publicHotel.heroEyebrow")}</div>
            <h1>{hotel.name}</h1>
            <p>{heroCopy}</p>
            <a className="button public-button" href="#stay" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>{t("publicHotel.heroViewRooms")} <ArrowRight size={15} /></a>
          </div>
          <div className="public-hero-caption"><span>{t("publicHotel.heroCountry")}</span><span>{hotel.address}</span></div>
        </section>

        {isVisible("story") ? (
          <section className="public-intro" id="story">
            <div className="eyebrow">{t("publicHotel.storyEyebrow")}</div>
            <div>
              <h2>{t("publicHotel.storyStayAt")}<br /><i>{hotel.name}.</i></h2>
              <p>{t("publicHotel.storyDesc")}</p>
            </div>
          </section>
        ) : null}

        <section className="public-rooms" id="stay">
          <div className="public-section-heading">
            <div>
              <div className="eyebrow">{t("publicHotel.roomsEyebrow")}</div>
              <h2>{t("publicHotel.roomsTitle")}<br /><i>{t("publicHotel.roomsTitleHighlight")}</i></h2>
            </div>
            <p>{t("publicHotel.roomsDesc")}</p>
          </div>
          {roomTypes.length ? (
            <div className="public-room-grid">
              {roomTypes.map((room: any, index: number) => (
                <article
                  className="public-room-card cursor-pointer"
                  key={room.id}
                  onClick={() => handleSelectRoom(room.id)}
                >
                  <div className="public-room-image">
                    {media[index + 1]?.url ? (
                      <img src={media[index + 1].url} alt={media[index + 1].caption ?? room.name} />
                    ) : heroImage ? (
                      <img src={heroImage} alt="" />
                    ) : (
                      <div className="public-room-image-fallback" />
                    )}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="public-room-copy">
                    <div>
                      <h3>{room.name}</h3>
                      <span>{t("publicHotel.roomCapacityFrom", { capacity: room.capacity, price: Number(room.basePrice).toLocaleString() })}</span>
                    </div>
                    <ArrowRight size={17} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-empty-state">{t("publicHotel.noRoomsPublished")}</div>
          )}
        </section>

        {isVisible("booking") ? <PublicBookingSection page={data} /> : null}

        <section className="public-details" id="location">
          <div>
            <div className="eyebrow">{t("publicHotel.locationEyebrow")}</div>
            <h2>{t("publicHotel.locationTitle")}<br /><i>{t("publicHotel.locationTitleHighlight")}</i></h2>
          </div>
          <div className="location-card">
            <MapPin size={16} />
            <div>
              <strong>{hotel.name}</strong>
              <span>{hotel.address}</span>
            </div>
          </div>
        </section>
      </main>
      {selectedTheme ? <footer className="theme-footer"><span>{hotel.name}</span><span>Booking powered by hayhost</span></footer> : <footer className="public-footer">
        <div className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></div>
        <span>© {new Date().getFullYear()} {hotel.name}</span>
        <span>{t("publicHotel.footerManagedSecurely")}</span>
      </footer>}
    </div>
  );
  if (selectedTheme === "cafe-homestay") return themed(page);
  return selectedTheme ? themed(page) : page;
}

