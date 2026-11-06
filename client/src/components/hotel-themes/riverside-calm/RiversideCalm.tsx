import React, { type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, MapPin, Users, Waves } from "lucide-react";
import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";
import "./riverside-calm.css";

const P = "hotelThemes.riversideCalm.";

function formatPrice(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

export default function RiversideCalmLanding(props: ThemeLandingProps) {
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
  const roomPhotos = media.filter((m) => !m.is_hero && m.url);
  const gallery = isVisible("gallery") ? roomPhotos.slice(0, MAX_WEBSITE_GALLERY_PHOTOS) : [];
  const showLocation = isVisible("location");
  const heroUrl = heroImage ?? media.find((m) => m.is_hero)?.url;
  const heroStyle = heroUrl
    ? ({ "--hero-image": `url("${heroUrl.replaceAll('"', '%22')}")`, "--hero-position": media.find((m) => m.is_hero)?.objectPosition ?? "center" } as CSSProperties)
    : undefined;

  const prices = roomTypes.map((r) => Number(r.basePrice)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  const roomHref = (id: string) =>
    isVisible("booking") ? bookingLink(id) : null;

  return (
    <ThemeLanding themeId="riverside-calm" hotelName={hotelName} colors={colours}>
    <div lang={language} className={`theme-riverside-calm${bookHref && minPrice !== null ? " has-sticky-bar" : ""}`}>
      {/* 1. HEADER / NAVIGATION */}
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <Waves size={20} />
            </span>
            <span className="brand-name">{hotelName}</span>
          </a>

          <nav className="main-nav" aria-label={tt("mainNav")}>
            {showRooms && <a href="#rooms">{tt("navRooms")}</a>}
            {gallery.length > 0 && <a href="#gallery">{tt("navGallery")}</a>}
            {showLocation && <a href="#location">{tt("navLocation")}</a>}
          </nav>

          <div className="header-actions">
            <div className="lang-switch" role="group" aria-label={tt("language")}>
              <button
                type="button"
                className={language === "th" ? "is-active" : ""}
                aria-pressed={language === "th"}
                onClick={() => setLanguage("th")}
              >
                TH
              </button>
              <button
                type="button"
                className={language === "en" ? "is-active" : ""}
                aria-pressed={language === "en"}
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
            {bookHref && (
              <a className="btn btn-primary header-book" href={bookHref}>
                <span>{tt("bookNow")}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 2. MAIN VIEWPORT */}
      <main id="top">
        {/* HERO SECTION */}
        {isVisible("hero") && (
          <section className="hero" style={heroStyle}>
            <div className="hero-overlay" aria-hidden="true" />
            <div className="container hero-container">
              <div className="hero-content">
                {hotel?.address && (
                  <span className="hero-chip">
                    <MapPin size={14} aria-hidden="true" />
                    <span>{hotel.address}</span>
                  </span>
                )}
                <h1 className="hero-title">{hotelName}</h1>
                <p className="hero-copy">{heroCopy}</p>
                {bookHref && (
                  <a className="btn btn-primary btn-lg" href={bookHref}>
                    <span>{tt("bookNow")}</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. STORY SECTION (Sand Band with undulating sine wave SVG dividers) */}
        {isVisible("story") && (
          <section className="story section" id="story">
            <div className="wave-divider wave-top" aria-hidden="true">
              <svg className="wave-svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,60 L1200,120 L0,120 Z" fill="currentColor" />
              </svg>
            </div>
            <div className="sand-band">
              <div className="container">
                <div className="sand-band-inner">
                  <span className="eyebrow">{tt("storyEyebrow")}</span>
                  <h2 className="section-title">{tt("story")}</h2>
                  <div className="accent-rule" aria-hidden="true" />
                  <p className="story-quote">“{heroCopy || tt("storyQuote")}”</p>
                  {hotel?.address && (
                    <span className="chip chip-sand">
                      <MapPin size={14} aria-hidden="true" />
                      <span>{hotel.address}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="wave-divider wave-bottom" aria-hidden="true">
              <svg className="wave-svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,0 L1200,0 L1200,60 C900,10 650,140 500,50 C350,-40 150,90 0,0 Z" fill="currentColor" />
              </svg>
            </div>
          </section>
        )}

        {/* 4. ROOMS SECTION */}
        {showRooms && (
          <section className="rooms section" id="rooms">
            <div className="container">
              <header className="section-head">
                <span className="eyebrow">{tt("roomsEyebrow")}</span>
                <h2 className="section-title">{tt("rooms")}</h2>
                <p className="section-subtitle">{tt("roomsSubtitle")}</p>
              </header>
              <ul className="room-grid">
                {roomTypes.map((room, idx) => {
                  const href = roomHref(room.id);
                  const amenities = (room.amenities ?? []).slice(0, 4);
                  const roomImage = roomPhotos[idx]?.url;
                  return (
                    <li className="room-card" key={room.id}>
                      <div className="room-image-wrap">
                        {roomImage ? (
                          <img src={roomImage} alt={room.name} loading="lazy" style={roomPhotos[idx]?.objectPosition ? ({ "--photo-position": roomPhotos[idx].objectPosition } as CSSProperties) : undefined} />
                        ) : (
                          <div className="room-image-placeholder" aria-hidden="true">
                            <Waves size={36} />
                          </div>
                        )}
                        <div className="water-reflect" aria-hidden="true" />
                      </div>
                      <div className="room-body">
                        <div className="room-header-row">
                          <h3 className="room-name">{room.name}</h3>
                          <div className="room-price">
                            <span className="room-price-label">{tt("from")}</span>
                            <span className="room-price-value">
                              {tt("currency")}
                              {formatPrice(room.basePrice)}
                            </span>
                            <span className="room-price-unit">{tt("perNight")}</span>
                          </div>
                        </div>
                        <p className="room-capacity">
                          <Users size={16} aria-hidden="true" />
                          <span>
                            {tt("sleeps")} {room.capacity} {tt("persons")}
                          </span>
                        </p>
                        {room.description && <p className="room-desc">{room.description}</p>}
                        <div className="room-divider" aria-hidden="true" />
                        {amenities.length > 0 && (
                          <ul className="chip-list">
                            {amenities.map((a) => (
                              <li className="chip" key={a}>
                                {a}
                              </li>
                            ))}
                          </ul>
                        )}
                        {href && (
                          <div className="room-foot">
                            <a className="btn btn-primary btn-block" href={href}>
                              {tt("select")}
                            </a>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* 5. GALLERY SECTION */}
        {gallery.length > 0 && (
          <section className="gallery section" id="gallery">
            <div className="container">
              <header className="section-head text-center">
                <span className="eyebrow">{tt("galleryEyebrow")}</span>
                <h2 className="section-title">{tt("gallery")}</h2>
                <p className="section-subtitle">{tt("gallerySubtitle")}</p>
              </header>
              <div className="gallery-box">
                <ul className="gallery-grid">
                  {gallery.map((m, i) => (
                    <li className={`gallery-item gallery-item-${i + 1}`} key={m.id ?? `${m.url}-${i}`}>
                      <img src={m.url} alt={m.caption || hotelName} loading="lazy" style={m.objectPosition ? ({ "--photo-position": m.objectPosition } as CSSProperties) : undefined} />
                      <div className="gallery-overlay" aria-hidden="true" />
                      {m.caption && <span className="gallery-caption">{m.caption}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* 6. LOCATION SECTION */}
        {showLocation && (
          <section className="location section" id="location">
            <div className="container">
              <header className="section-head">
                <span className="eyebrow">{tt("locationEyebrow")}</span>
                <h2 className="section-title">{tt("location")}</h2>
              </header>
              <div className={`location-grid${locationMap ? " has-map" : ""}`}>
                <div className="location-card">
                  <div className="location-card-head">
                    <h3 className="location-name">{hotelName}</h3>
                  </div>
                  <div className="location-details">
                    {hotel?.address && (
                      <div className="location-item">
                        <span className="location-label">{tt("address")}</span>
                        <p className="location-address">{hotel.address}</p>
                      </div>
                    )}
                    {contacts && <div className="location-contacts">{contacts}</div>}
                  </div>
                </div>
                {locationMap && <div className="location-map">{locationMap}</div>}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 7. FOOTER */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <p className="footer-name">{hotelName}</p>
            {hotel?.address && <p className="footer-address">{hotel.address}</p>}
          </div>
          <nav className="footer-nav" aria-label={tt("mainNav")}>
            {showRooms && <a href="#rooms">{tt("navRooms")}</a>}
            {gallery.length > 0 && <a href="#gallery">{tt("navGallery")}</a>}
            {showLocation && <a href="#location">{tt("navLocation")}</a>}
          </nav>
          <p className="footer-powered"><PoweredByHayhost label={tt("poweredBy")} /></p>
        </div>
      </footer>

      {/* 8. MOBILE STICKY BAR */}
      {bookHref && minPrice !== null && (
        <aside className="sticky-bar">
          <div className="sticky-price">
            <span className="sticky-label">{tt("from")}</span>
            <span className="sticky-value">
              {tt("currency")}
              {formatPrice(minPrice)} <small>{tt("perNight")}</small>
            </span>
          </div>
          <a className="btn btn-primary" href={bookHref}>
            <span>{tt("bookNow")}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </aside>
      )}
    </div>
    </ThemeLanding>
  );
}
