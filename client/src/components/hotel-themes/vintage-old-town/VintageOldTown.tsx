import React, { type CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Landmark,
  Mail,
  MapPin,
  Users,
} from "lucide-react";

import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";
import "./vintage-old-town.css";

const P = "hotelThemes.vintageOldTown.";

function formatPrice(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

export default function VintageOldTownLanding(props: ThemeLandingProps) {
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
  const gallery = isVisible("gallery") ? media.filter((m) => !m.is_hero && m.url).slice(0, MAX_WEBSITE_GALLERY_PHOTOS) : [];
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
    <ThemeLanding themeId="vintage-old-town" hotelName={hotelName} colors={colours}>
    <div lang={language} className={`theme-vintage-old-town${bookHref && minPrice !== null ? " has-sticky-bar" : ""}`}>
      {/* Header navigation */}
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <Landmark size={20} />
            </span>
            <div className="brand-text">
              <span className="brand-name">{hotelName}</span>
              <span className="brand-subtitle">{tt("heroEyebrow")}</span>
            </div>
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
              <a className="btn btn-ticket header-book" href={bookHref}>
                <span>{tt("bookNow")}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="top">
        {/* Hero travel poster */}
        {isVisible("hero") && (
          <section className="hero-section" style={heroStyle}>
            <div className="container">
              <div className="hero-canvas">
                <div className="corner-accent corner-top-left" aria-hidden="true" />
                <div className="corner-accent corner-top-right" aria-hidden="true" />
                <div className="corner-accent corner-bottom-left" aria-hidden="true" />
                <div className="corner-accent corner-bottom-right" aria-hidden="true" />

                <div className="hero-broadside-head">
                  <span className="hero-series-badge">{tt("heroSeries")}</span>
                  {hotel?.address && (
                    <span className="hero-address-badge">
                      <MapPin size={13} aria-hidden="true" />
                      <span>{hotel.address}</span>
                    </span>
                  )}
                </div>

                <div className="hero-grid">
                  <div className="hero-visual-col">
                    {heroUrl ? (
                      <div className="postcard-frame hero-postcard tilt-neg-10">
                        <div className="hero-image-wrap">
                          <img src={heroUrl} alt={hotelName} className="hero-img" style={media.find((m) => m.is_hero)?.objectPosition ? ({ "--photo-position": media.find((m) => m.is_hero)?.objectPosition } as CSSProperties) : undefined} />
                        </div>

                      </div>
                    ) : (
                      <div className="postcard-frame hero-postcard tilt-neg-10 hero-placeholder">
                        <Landmark size={56} className="hero-placeholder-icon" aria-hidden="true" />
                        <span className="hero-placeholder-title">{hotelName}</span>
                      </div>
                    )}
                  </div>

                  <div className="hero-info-col">
                    <div className="hero-eyebrow-wrap">
                      <Landmark size={16} className="hero-icon" aria-hidden="true" />
                      <span className="hero-eyebrow">{tt("heroEyebrow")}</span>
                    </div>
                    <h1 className="hero-title">{hotelName}</h1>
                    <div className="hero-accent-rule" aria-hidden="true" />
                    <p className="hero-copy">{heroCopy}</p>
                    {bookHref && (
                      <div className="hero-cta-wrap">
                        <a className="btn btn-ticket btn-lg hero-cta" href={bookHref}>
                          <span>{tt("bookNow")}</span>
                          <ArrowRight size={18} aria-hidden="true" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Postcard note */}
        {isVisible("story") && (
          <section className="story-section section" id="story">
            <div className="container">
              <div className="story-container">
                <div className="story-stamp-header">
                  <span className="stamp-tag">{tt("storyEyebrow")}</span>
                  <div className="stamp-rule" aria-hidden="true" />
                </div>

                <div className="story-postcard-body">
                  <div className={`story-content-grid${heroUrl ? "" : " no-photo"}`}>
                    <div className="story-visual-col">
                      {heroUrl && (
                        <div className="postcard-frame story-postcard tilt-neg-15">
                          <img src={heroUrl} alt={hotelName} loading="lazy" className="story-img" style={media.find((m) => m.is_hero)?.objectPosition ? ({ "--photo-position": media.find((m) => m.is_hero)?.objectPosition } as CSSProperties) : undefined} />
                          <div className="story-caption">
                            <span>{hotelName}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="story-text-col">
                      <div className="story-heading-group">
                        <Mail size={18} className="story-mail-icon" aria-hidden="true" />
                        <h2 className="story-title">{tt("story")}</h2>
                      </div>
                      <blockquote className="story-quote">{heroCopy}</blockquote>
                      <p className="story-body">{tt("storyBody")}</p>
                      {hotel?.address && (
                        <div className="story-address-card">
                          <MapPin size={16} aria-hidden="true" />
                          <span>{hotel.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Room tickets */}
        {showRooms && (
          <section className="rooms-section section" id="rooms">
            <div className="container">
              <header className="section-head text-center">
                <span className="eyebrow-badge">{tt("roomsEyebrow")}</span>
                <h2 className="section-title">{tt("rooms")}</h2>
                <p className="section-subtitle">{tt("roomsSubtitle")}</p>
              </header>

              <ul className="rooms-grid">
                {roomTypes.map((room, index) => {
                  const href = roomHref(room.id);
                  const amenities = (room.amenities ?? []).slice(0, 4);
                  const cardVariant =
                    index % 3 === 0
                      ? "ticket-card-primary"
                      : index % 3 === 1
                      ? "ticket-card-secondary"
                      : "ticket-card-tertiary";
                  const berthNumber = String(index + 1).padStart(2, "0");

                  return (
                    <li className={`ticket-card ${cardVariant}`} key={room.id}>
                      <div className="ticket-top-ribbon">
                        <span>
                          {tt("berthPass")} {tt("berthNo")} {berthNumber}
                        </span>
                        <Landmark size={14} aria-hidden="true" />
                      </div>

                      <div className="ticket-body">
                        <h3 className="room-name">{room.name}</h3>

                        <div className="room-meta-box">
                          <div className="room-capacity">
                            <Users size={16} aria-hidden="true" />
                            <span>
                              {tt("sleeps")} {room.capacity} {tt("persons")}
                            </span>
                          </div>
                          {room.description && <p className="room-desc">{room.description}</p>}
                        </div>

                        {amenities.length > 0 && (
                          <div className="room-amenities">
                            <span className="amenities-title">{tt("features")}:</span>
                            <ul className="amenity-list">
                              {amenities.map((a) => (
                                <li className="amenity-item" key={a}>
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="ticket-perforation" aria-hidden="true">
                          <div className="ticket-perforation-rule" />
                        </div>

                        <div className="ticket-foot">
                          <div className="room-price-box">
                            <span className="price-label">{tt("from")}</span>
                            <div className="price-value">
                              <span className="currency">{tt("currency")}</span>
                              <span className="amount">{formatPrice(room.basePrice)}</span>
                              <span className="unit">{tt("perNight")}</span>
                            </div>
                          </div>
                          {href && (
                            <a className="btn btn-ticket btn-sm" href={href}>
                              <span>{tt("select")}</span>
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

        {/* 5. Gallery Section: Scattered Postcards on Parchment */}
        {gallery.length > 0 && (
          <section className="gallery-section section" id="gallery">
            <div className="container">
              <header className="section-head">
                <div className="head-left">
                  <span className="eyebrow-badge">{tt("galleryEyebrow")}</span>
                  <h2 className="section-title">{tt("gallery")}</h2>
                </div>
                <span className="head-note">{tt("gallerySubtitle")}</span>
              </header>

              <ul className="gallery-grid">
                {gallery.map((m, i) => {
                  const tiltClasses = [
                    "tilt-neg-15",
                    "tilt-pos-20",
                    "tilt-neg-20",
                    "tilt-pos-15",
                    "tilt-neg-10",
                    "tilt-pos-20",
                  ];
                  const tiltClass = tiltClasses[i % tiltClasses.length];
                  const frameNumber = String(i + 1).padStart(2, "0");

                  return (
                    <li className="gallery-card-wrap" key={m.id ?? `${m.url}-${i}`}>
                      <div className={`postcard-frame gallery-postcard ${tiltClass}`}>
                        <div className="gallery-image-box">
                          <img
                            src={m.url}
                            alt={m.caption || hotelName}
                            loading="lazy"
                            className="gallery-img"
                            style={m.objectPosition ? ({ "--photo-position": m.objectPosition } as CSSProperties) : undefined}
                          />
                        </div>
                        <div className="gallery-caption-row">
                          <span className="gallery-caption-text">{m.caption || hotelName}</span>
                          <span className="gallery-index">
                            {tt("galleryFrame")} {frameNumber}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* 6. Location Section: District Atlas & Wayfinding */}
        {showLocation && (
          <section className="location-section section" id="location">
            <div className="container">
              <div className="location-card">
                <header className="location-head">
                  <div>
                    <div className="location-eyebrow-wrap">
                      <MapPin size={16} aria-hidden="true" />
                      <span className="location-eyebrow">{tt("locationEyebrow")}</span>
                    </div>
                    <h2 className="location-title">{hotelName}</h2>
                    {hotel?.address && <p className="location-address">{hotel.address}</p>}
                  </div>
                </header>

                <div className="location-body">
                  {locationMap ? (
                    <div className="location-map-wrap">{locationMap}</div>
                  ) : (
                    <div className="location-map-fallback">
                      <div className="fallback-marker">
                        <MapPin size={28} className="marker-icon" aria-hidden="true" />
                        <span className="marker-title">{hotelName}</span>
                        {hotel?.address && (
                          <span className="marker-address">{hotel.address}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {contacts && <div className="location-contacts-wrap">{contacts}</div>}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 7. Footer */}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-perforation" aria-hidden="true" />
          <div className="footer-inner">
            <div className="footer-brand">
              <p className="footer-name">© {hotelName}</p>
              {hotel?.address && <p className="footer-address">{hotel.address}</p>}
            </div>
            <div className="footer-meta">
              <span className="footer-mood-tag">{tt("heroEyebrow")}</span>
              <p className="footer-powered"><PoweredByHayhost label={tt("poweredBy")} /></p>
            </div>
          </div>
        </div>
      </footer>

      {/* 8. Mobile Sticky Bar */}
      {bookHref && minPrice !== null && (
        <aside className="sticky-bar" aria-label={tt("bookNow")}>
          <div className="sticky-fare">
            <span className="sticky-label">{tt("from")}</span>
            <span className="sticky-amount">
              {tt("currency")}
              {formatPrice(minPrice)} <small>{tt("perNight")}</small>
            </span>
          </div>
          <a className="btn btn-ticket sticky-btn" href={bookHref}>
            <span>{tt("bookNow")}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </aside>
      )}
    </div>
    </ThemeLanding>
  );
}
