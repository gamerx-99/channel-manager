import React, { type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, MapPin, Sparkles, Users } from "lucide-react";
import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";
import "./boutique-noir.css";

const P = "hotelThemes.boutiqueNoir.";

function formatPrice(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

export default function BoutiqueNoirLanding(props: ThemeLandingProps) {
  const { hotelName, hotel, roomTypes, media, bookingLink, colours, heroImage, heroCopy, language, setLanguage, isVisible, contacts, locationMap, t } = props;
  const tt = (key: string) => t(P + key);
  const bookHref = isVisible("booking") ? bookingLink() : null;
  const showRooms = isVisible("rooms") && roomTypes.length > 0;
  const gallery = media.filter((m) => !m.is_hero && m.url).slice(0, MAX_WEBSITE_GALLERY_PHOTOS);
  const showLocation = isVisible("location");
  const heroUrl = heroImage ?? media.find((m) => m.is_hero)?.url;
  const heroStyle = heroUrl ? ({ "--hero-image": `url("${heroUrl.replaceAll('"', '%22')}")` } as CSSProperties) : undefined;
  const prices = roomTypes.map((r) => Number(r.basePrice)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  return (
    <ThemeLanding themeId="boutique-noir" hotelName={hotelName} colors={colours}>
      <div className={`theme-boutique-noir${bookHref && minPrice !== null ? " has-sticky-bar" : ""}`}>
        <header className="site-header"><div className="header-inner">
          <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><Sparkles size={18} /></span><span className="brand-name">{hotelName}</span></a>
          <nav className="main-nav" aria-label={tt("mainNav")}>
            {showRooms && <a href="#rooms">{tt("navRooms")}</a>}{gallery.length > 0 && <a href="#gallery">{tt("navGallery")}</a>}{showLocation && <a href="#location">{tt("navLocation")}</a>}
          </nav>
          <div className="header-actions"><div className="lang-switch" role="group" aria-label={tt("language")}>
            <button type="button" className={language === "th" ? "is-active" : ""} aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
            <button type="button" className={language === "en" ? "is-active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>{bookHref && <a className="btn btn-primary header-book" href={bookHref}><span>{tt("bookNow")}</span><ArrowUpRight size={16} aria-hidden="true" /></a>}</div>
        </div></header>
        <main id="top">
          {isVisible("hero") && <section className="hero" style={heroStyle}><div className="hero-overlay" aria-hidden="true" /><div className="container hero-container"><div className="hero-content">
            <span className="eyebrow">{tt("heroEyebrow")}</span><h1 className="hero-title">{hotelName}</h1><p className="hero-copy">{heroCopy}</p>
            {hotel?.address && <span className="hero-chip"><MapPin size={14} aria-hidden="true" /><span>{hotel.address}</span></span>}
            {bookHref && <div className="hero-actions"><a className="btn btn-primary btn-lg" href={bookHref}><span>{tt("bookNow")}</span><ArrowRight size={18} aria-hidden="true" /></a></div>}
          </div></div></section>}
          {isVisible("story") && <section className="story section" id="story"><div className="container"><div className="story-grid"><div className="story-editorial">
            <div className="chapter-label"><span className="chapter-numeral">{tt("storyChapter")}</span><span className="eyebrow">{tt("storyEyebrow")}</span></div><h2 className="section-title">{tt("story")}</h2><div className="gold-hairline-rule" aria-hidden="true" />
            <p className="story-lead drop-cap">{heroCopy}</p><p className="story-body">{tt("storyBody")}</p>{hotel?.address && <span className="chip"><MapPin size={14} aria-hidden="true" /><span>{hotel.address}</span></span>}
          </div><div className="story-accent" aria-hidden="true"><div className="story-frame"><div className="story-frame-inner"><Sparkles size={32} className="story-frame-icon" /><div className="story-frame-divider" /><span className="story-frame-caption">{hotelName}</span></div></div></div></div></div></section>}
          {showRooms && <section className="rooms section section-tint" id="rooms"><div className="container"><header className="section-head"><div className="chapter-label"><span className="chapter-numeral">{tt("roomsChapter")}</span><span className="eyebrow">{tt("roomsEyebrow")}</span></div><h2 className="section-title">{tt("rooms")}</h2><p className="section-subtitle">{tt("roomsSubtitle")}</p></header>
            <ul className="room-list">{roomTypes.map((room, idx) => { const href = isVisible("booking") ? bookingLink(room.id) : null; const amenities = (room.amenities ?? []).slice(0, 4); const suiteNumber = String(idx + 1).padStart(2, "0"); return <li className="room-card" key={room.id}>
              <div className="room-aside" aria-hidden="true"><div className="room-badge"><span className="room-badge-num">{suiteNumber}</span></div><div className="room-aside-glow" /></div>
              <div className="room-body"><div className="room-info"><h3 className="room-name">{room.name}</h3><p className="room-capacity"><Users size={16} aria-hidden="true" /><span>{tt("sleeps")} {room.capacity} {tt("persons")}</span></p>{room.description && <p className="room-desc">{room.description}</p>}
                {amenities.length > 0 && <ul className="chip-list">{amenities.map((a) => <li className="chip" key={a}>{a}</li>)}</ul>}</div>
                <div className="room-foot"><div className="room-price"><span className="room-price-label">{tt("from")}</span><span className="room-price-value">{tt("currency")}{formatPrice(room.basePrice)}</span><span className="room-price-unit">{tt("perNight")}</span></div>{href && <a className="btn btn-primary room-book" href={href}><span>{tt("select")}</span><ArrowRight size={16} aria-hidden="true" /></a>}</div>
              </div></li>; })}</ul>
          </div></section>}
          {gallery.length > 0 && <section className="gallery section" id="gallery"><div className="container"><header className="section-head text-center"><div className="chapter-label center"><span className="chapter-numeral">{tt("galleryChapter")}</span><span className="eyebrow">{tt("galleryEyebrow")}</span></div><h2 className="section-title">{tt("gallery")}</h2><p className="section-subtitle">{tt("gallerySubtitle")}</p></header>
            <ul className="gallery-grid">{gallery.map((m, i) => <li className="gallery-item" key={m.id ?? `${m.url}-${i}`}><img src={m.url} alt={m.caption || hotelName} loading="lazy" /><div className="gallery-overlay" aria-hidden="true" />{m.caption && <span className="gallery-caption">{m.caption}</span>}</li>)}</ul>
          </div></section>}
          {showLocation && <section className="location section section-tint" id="location"><div className="container"><header className="section-head"><div className="chapter-label"><span className="chapter-numeral">{tt("locationChapter")}</span><span className="eyebrow">{tt("locationEyebrow")}</span></div><h2 className="section-title">{tt("location")}</h2></header>
            <div className={`location-grid${locationMap ? " has-map" : ""}`}>{locationMap && <div className="location-map">{locationMap}</div>}<div className="location-info"><div className="location-card"><div className="location-head"><span className="location-icon" aria-hidden="true"><MapPin size={20} /></span><h3 className="location-name">{hotelName}</h3></div>{hotel?.address && <p className="location-address">{hotel.address}</p>}{contacts && <div className="location-contacts">{contacts}</div>}</div>
              </div></div>
          </div></section>}
        </main>
        <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><p className="footer-name">© {hotelName}</p>{hotel?.address && <p className="footer-address">{hotel.address}</p>}</div><p className="footer-powered"><PoweredByHayhost label={tt("poweredBy")} /></p></div></footer>
        {bookHref && minPrice !== null && <aside className="sticky-bar"><div className="sticky-price"><span className="sticky-label">{tt("from")}</span><span className="sticky-value">{tt("currency")}{formatPrice(minPrice)} <small>{tt("perNight")}</small></span></div><a className="btn btn-primary" href={bookHref}><span>{tt("bookNow")}</span><ArrowRight size={16} aria-hidden="true" /></a></aside>}
      </div>
    </ThemeLanding>
  );
}
