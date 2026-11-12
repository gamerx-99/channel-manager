import React, { type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Bed, MapPin, Sparkles, Users } from "lucide-react";
import { HotelLogo } from "@/components/hotel/HotelLogo";

import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";
import "./hostel-pop.css";

const P = "hotelThemes.hostelPop.";

const ROOM_CARD_COLORS = ["card-yellow", "card-pink", "card-cyan", "card-white"];

function formatPrice(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

export default function HostelPopLanding(props: ThemeLandingProps) {
  const {
    hotelName,
    hotel,
    roomTypes,
    media,
    bookingLink,
    colours,
    heroImage,
    heroCopy,
    language,
    setLanguage,
    isVisible,
    contacts,
    locationMap,
    t,
  } = props;

  const tt = (key: string) => t(P + key);
  const bookHref = isVisible("booking") ? bookingLink() : null;
  const showRooms = isVisible("rooms") && roomTypes.length > 0;
  const gallery = media.filter((m) => !m.is_hero && m.url).slice(0, MAX_WEBSITE_GALLERY_PHOTOS);
  const showLocation = isVisible("location");
  const heroMedia = media.find((m) => m.is_hero);
  const heroUrl = heroImage ?? heroMedia?.url;
  const heroStyle = heroMedia?.objectPosition
    ? ({ "--hero-position": heroMedia.objectPosition } as CSSProperties)
    : undefined;

  const prices = roomTypes.map((r) => Number(r.basePrice)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  const roomHref = (id: string) =>
    isVisible("booking") ? bookingLink(id) : null;

  return (
    <ThemeLanding themeId="hostel-pop" hotelName={hotelName} colors={colours}>
    <div lang={language} className={`theme-hostel-pop${bookHref && minPrice !== null ? " has-sticky-bar" : ""}`}>
      {/* ================= HEADER ================= */}
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#top"><HotelLogo url={hotel?.logo_url} name={hotelName} />
            <span className="brand-mark rotate-neg-4" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <span className="brand-name">{hotelName}</span>
          </a>

          <nav className="main-nav" aria-label={tt("mainNav")}>
            {showRooms && (
              <a className="nav-link" href="#rooms">
                {tt("navRooms")}
              </a>
            )}
            {gallery.length > 0 && (
              <a className="nav-link" href="#gallery">
                {tt("navGallery")}
              </a>
            )}
            {showLocation && (
              <a className="nav-link" href="#location">
                {tt("navLocation")}
              </a>
            )}
          </nav>

          <div className="header-actions">
            <div className="lang-switch rotate-2" role="group" aria-label={tt("language")}>
              <button
                type="button"
                className={`lang-btn ${language === "th" ? "is-active" : ""}`}
                aria-pressed={language === "th"}
                onClick={() => setLanguage("th")}
              >
                TH
              </button>
              <span className="lang-divider" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                className={`lang-btn ${language === "en" ? "is-active" : ""}`}
                aria-pressed={language === "en"}
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>

            {bookHref && (
              <a className="btn btn-pink header-book" href={bookHref}>
                <span>{tt("bookNow")}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* ================= HERO SECTION ================= */}
        {isVisible("hero") && (
          <section className="hero" style={heroStyle}>
            <div className="hero-pattern" aria-hidden="true" />
            <div className="container hero-container">
              <div className="hero-stickers">
                <span className="sticker-badge sticker-cyan rotate-neg-2">
                  {tt("heroBadge1")}
                </span>
                <span className="sticker-badge sticker-pink rotate-3">
                  {tt("heroBadge2")}
                </span>
                {hotel?.address && (
                  <span className="sticker-badge sticker-white rotate-neg-1">
                    <MapPin size={12} aria-hidden="true" />
                    <span>{hotel.address}</span>
                  </span>
                )}
              </div>

              <div className="hero-grid">
                <div className="hero-text-col">
                  <h1 className="hero-title">
                    <span className="hero-title-main">{hotelName}</span>
                  </h1>
                  <div className="hero-copy-card">
                    <p className="hero-copy">{heroCopy}</p>
                  </div>
                  {bookHref && (
                    <a className="btn btn-hero" href={bookHref}>
                      <span>{tt("bookNow")}</span>
                      <ArrowRight size={20} aria-hidden="true" />
                    </a>
                  )}
                </div>

                {heroUrl && (
                  <div className="hero-visual-col">
                    <div className="hero-photo-frame rotate-neg-2">
                      <img src={heroUrl} alt={hotelName} className="hero-photo" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ================= STORY SECTION ================= */}
        {isVisible("story") && (
          <section className="story section" id="story">
            <div className="container">
              <div className="story-card">
                <div className="story-sticker sticker-pink rotate-3">
                  {tt("storyEyebrow")}
                </div>
                <span className="story-kicker sticker-badge sticker-yellow">
                  {tt("story")}
                </span>
                <h2 className="story-lead">"{heroCopy}"</h2>
                <div className="story-divider" aria-hidden="true" />
                <p className="story-body">{tt("storyBody")}</p>
                {hotel?.address && (
                  <div className="story-address-chip">
                    <MapPin size={14} aria-hidden="true" />
                    <span>{hotel.address}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ================= ROOMS SECTION ================= */}
        {showRooms && (
          <section className="rooms section" id="rooms">
            <div className="container">
              <header className="section-head">
                <div className="section-head-text">
                  <span className="sticker-badge sticker-pink rotate-neg-2">
                    {tt("roomsEyebrow")}
                  </span>
                  <h2 className="section-title">{tt("rooms")}</h2>
                </div>
                <p className="section-subtitle">{tt("roomsSubtitle")}</p>
              </header>

              <ul className="room-grid">
                {roomTypes.map((room, index) => {
                  const href = roomHref(room.id);
                  const colorClass = ROOM_CARD_COLORS[index % ROOM_CARD_COLORS.length];
                  const amenities = (room.amenities ?? []).slice(0, 4);

                  return (
                    <li className={`room-card ${colorClass}`} key={room.id}>
                      <div className="room-top" aria-hidden="true">
                        <Bed size={32} />
                      </div>
                      <div className="room-body">
                        <h3 className="room-name">{room.name}</h3>
                        <p className="room-capacity">
                          <Users size={16} aria-hidden="true" />
                          <span>
                            {tt("sleeps")} {room.capacity} {tt("persons")}
                          </span>
                        </p>
                        {room.description && <p className="room-desc">{room.description}</p>}
                        {amenities.length > 0 && (
                          <ul className="chip-list">
                            {amenities.map((a) => (
                              <li className="chip" key={a}>
                                {a}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="room-foot">
                          <div className="room-price">
                            <span className="room-price-label">{tt("from")}</span>
                            <span className="room-price-value">
                              {tt("currency")}
                              {formatPrice(room.basePrice)}
                            </span>
                            <span className="room-price-unit">{tt("perNight")}</span>
                          </div>
                          {href && (
                            <a className="btn btn-select" href={href}>
                              {tt("select")}
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* ================= GALLERY SECTION ================= */}
        {gallery.length > 0 && (
          <section className="gallery section" id="gallery">
            <div className="container">
              <header className="section-head text-center">
                <span className="sticker-badge sticker-yellow rotate-neg-1">
                  {tt("galleryEyebrow")}
                </span>
                <h2 className="section-title">{tt("gallery")}</h2>
                <p className="section-subtitle">{tt("gallerySubtitle")}</p>
              </header>

              <ul className="gallery-bento">
                {gallery.map((m, i) => (
                  <li
                    className={`gallery-tile gallery-tile-${i + 1}`}
                    key={m.id ?? `${m.url}-${i}`}
                  >
                    {m.caption && (
                      <span className={`gallery-sticker sticker-tile-${(i % 3) + 1}`}>
                        {m.caption}
                      </span>
                    )}
                    <img src={m.url} alt={m.caption || hotelName} loading="lazy" style={m.objectPosition ? ({ "--photo-position": m.objectPosition } as CSSProperties) : undefined} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ================= LOCATION SECTION ================= */}
        {showLocation && (
          <section className="location section" id="location">
            <div className="container">
              <header className="section-head">
                <div className="section-head-text">
                  <span className="sticker-badge sticker-yellow rotate-2">
                    {tt("locationEyebrow")}
                  </span>
                  <h2 className="section-title">{tt("location")}</h2>
                </div>
              </header>

              <div className="location-grid">
                <div className="location-map-wrap">
                  <div className="location-pin-sticker">
                    <MapPin size={18} aria-hidden="true" />
                    <span>{tt("pinLabel")}</span>
                  </div>
                  {locationMap ? (
                    <div className="location-map-inner">{locationMap}</div>
                  ) : (
                    <div className="location-map-placeholder">
                      <MapPin size={48} aria-hidden="true" />
                      {hotel?.address && (
                        <span className="map-placeholder-address">{hotel.address}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="location-info-card">
                  <span className="sticker-badge sticker-white rotate-neg-2">
                    {tt("location")}
                  </span>
                  <h3 className="location-hotel-name">{hotelName}</h3>
                  {hotel?.address && <p className="location-address">{hotel.address}</p>}
                  {contacts && <div className="location-contacts">{contacts}</div>}
                  {bookHref && (
                    <a className="btn btn-hero btn-block" href={bookHref}>
                      <span>{tt("bookNow")}</span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <span className="footer-name">© {hotelName}</span>
            {hotel?.address && <p className="footer-address">{hotel.address}</p>}
          </div>
          <p className="footer-powered"><PoweredByHayhost label={tt("poweredBy")} /></p>
        </div>
      </footer>

      {/* ================= MOBILE STICKY BAR ================= */}
      {bookHref && minPrice !== null && (
        <aside className="sticky-bar">
          <div className="sticky-price">
            <span className="sticky-label">{tt("from")}</span>
            <span className="sticky-value">
              {tt("currency")}
              {formatPrice(minPrice)} <small>{tt("perNight")}</small>
            </span>
          </div>
          <a className="btn btn-pink btn-sticky" href={bookHref}>
            <span>{tt("bookNow")}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </aside>
      )}
    </div>
    </ThemeLanding>
  );
}
