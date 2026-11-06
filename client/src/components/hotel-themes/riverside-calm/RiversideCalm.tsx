/*
 * (a) Google Fonts ที่ธีมนี้ใช้:
 *   - Pridi (หัวข้อภาษาไทย)
 *   - Noto Serif (หัวข้อภาษาอังกฤษ)
 *   - Noto Sans Thai (เนื้อหาภาษาไทย)
 *   - Noto Sans (เนื้อหาภาษาอังกฤษ)
 *
 * (b) ตารางคำแปล (prefix ทุก key = hotelThemes.riversideCalm.)
 *
 * key              | ไทย                                                                                     | English
 * -----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------
 * mainNav          | เมนูหลัก                                                                                | Main menu
 * navRooms         | ห้องพัก                                                                                 | Rooms
 * navGallery       | รูปที่พัก                                                                               | Gallery
 * navLocation      | ที่ตั้ง                                                                                 | Location
 * language         | เปลี่ยนภาษา                                                                             | Change language
 * bookNow          | จองเลย                                                                                  | Book now
 * storyEyebrow     | พักผ่อนริมน้ำ                                                                           | Riverside retreat
 * story            | บรรยากาศริมน้ำปิง                                                                       | Life by the Ping
 * storyQuote       | พักผ่อนสบาย ๆ ริมแม่น้ำปิง นั่งรับลม ชมวิวสายน้ำ และสัมผัสความเงียบสงบอย่างแท้จริง       | Unhurried comfort by the river. Savor the slow drift of the water, gentle breezes, and tranquil seclusion.
 * roomsEyebrow     | ห้องพักของเรา                                                                           | Accommodations
 * rooms            | ห้องพักริมน้ำ                                                                           | Riverside rooms
 * roomsSubtitle    | สัมผัสความเงียบสงบและวิวแม่น้ำปิงจากระเบียงห้องพัก                                       | Tranquil riverside spaces with direct views of the Ping River
 * roomViewTag      | วิวแม่น้ำ                                                                               | River view
 * sleeps           | พักได้                                                                                  | Sleeps up to
 * persons          | คน                                                                                      | guests
 * from             | เริ่มต้น                                                                                | From
 * currency         | ฿                                                                                       | ฿
 * perNight         | / คืน                                                                                   | / night
 * select           | เลือกห้องนี้                                                                            | Choose this room
 * galleryEyebrow   | มุมมองริมน้ำ                                                                            | Visual retreat
 * gallery          | รูปที่พัก                                                                               | Photos
 * gallerySubtitle  | ภาพบรรยากาศและความสงบเงียบริมสายน้ำ                                                     | Glimpses of quiet riparian retreat
 * locationEyebrow  | การเดินทาง                                                                              | Our setting
 * location         | ที่ตั้งและการเดินทาง                                                                    | Location & directions
 * locationBadge    | ริมฝั่งแม่น้ำปิง                                                                        | Riverfront location
 * address          | ที่อยู่                                                                                 | Address
 * poweredBy        | จองผ่าน hayhost                                                                         | Booking powered by hayhost
 */

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
                      <Waves size={14} aria-hidden="true" />
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
                        <span className="room-chip">{tt("roomViewTag")}</span>
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
              <div className="location-grid">
                <div className="location-card">
                  <div className="location-card-head">
                    <span className="chip chip-teal">
                      <span className="pulse-dot" aria-hidden="true" />
                      <span>{tt("locationBadge")}</span>
                    </span>
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
                <div className="location-map">
                  {locationMap ?? (
                    <div className="location-map-fallback" aria-hidden="true">
                      <svg className="river-map-svg" viewBox="0 0 700 420" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="rcRiverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#2F6F73" stopOpacity="0.85" />
                            <stop offset="50%" stopColor="#26676B" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="#2F6F73" stopOpacity="0.85" />
                          </linearGradient>
                        </defs>
                        <rect width="100%" height="100%" fill="#F5EFE6" />
                        <path d="M 0,90 Q 200,120 400,80 T 700,110" fill="none" stroke="#E2D5C3" strokeWidth="1.5" opacity="0.6" />
                        <path d="M 0,220 Q 250,240 500,200 T 700,230" fill="none" stroke="#E2D5C3" strokeWidth="1.5" opacity="0.6" />
                        <path d="M 0,340 Q 220,320 450,370 T 700,330" fill="none" stroke="#E2D5C3" strokeWidth="1.5" opacity="0.6" />
                        <path d="M 120,0 L 220,420" fill="none" stroke="#DCCBB5" strokeWidth="3" strokeDasharray="4,6" />
                        <path d="M 520,0 L 460,420" fill="none" stroke="#DCCBB5" strokeWidth="3" />
                        <path d="M 220,230 L 480,210" fill="none" stroke="#DCCBB5" strokeWidth="4" />
                        <path d="M 260,0 C 290,80 320,130 350,190 C 380,250 360,290 330,350 C 310,390 290,410 280,420" fill="none" stroke="url(#rcRiverGradient)" strokeWidth="36" strokeLinecap="round" />
                        <path d="M 260,0 C 290,80 320,130 350,190 C 380,250 360,290 330,350 C 310,390 290,410 280,420" fill="none" stroke="#A8D5D1" strokeWidth="3" strokeDasharray="10,10" opacity="0.75" />
                        <g transform="translate(370, 205)">
                          <circle cx="0" cy="0" r="14" fill="#2F6F73" opacity="0.25" />
                          <circle cx="0" cy="0" r="8" fill="#0D575A" />
                          <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
                        </g>
                      </svg>
                      <div className="river-map-badge">
                        <span className="pulse-dot" />
                        <span className="river-map-badge-text">{hotelName}</span>
                      </div>
                    </div>
                  )}
                </div>
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
