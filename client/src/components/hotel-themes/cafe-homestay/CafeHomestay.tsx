import React from "react";
import "./cafe-homestay.css";
import { MapPin } from "lucide-react";
import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";

function CupDecoration() {
  return <div className="cafe-cup-stamp" aria-hidden="true"><div className="cup-rim"><div className="cup-steam" /></div><div className="cup-body"><div className="cup-handle" /></div></div>;
}

function LeafDecoration() {
  return <div className="cafe-leaf-stamp" aria-hidden="true"><svg viewBox="0 0 44 44" width="44" height="44" fill="none"><path d="M6 38 C 10 22, 22 10, 38 6 C 34 22, 22 34, 6 38 Z" fill="currentColor" opacity="0.12" /><path d="M6 38 Q 22 22 38 6" stroke="currentColor" strokeWidth="1.5" opacity="0.3" /></svg></div>;
}

type Props = ThemeLandingProps;

export default function CafeHomestayLanding({
  hotelName,
  bookingLink,
  colours,
  hotel,
  roomTypes,
  media,
  heroImage,
  heroCopy,
  language,
  setLanguage,
  isVisible,
  contacts,
  locationMap,
  t,
}: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, MAX_WEBSITE_GALLERY_PHOTOS);
  const address = hotel?.address?.trim() ?? "";
  const hasLocation = Boolean(address);
  const slug = hotel?.slug ?? "";
  const canBook = isVisible("booking");

  return (
    <ThemeLanding themeId="cafe-homestay" hotelName={hotelName} colors={colours}>
      <div className="cafe-page">
        <header className="cafe-header">
          <a className="cafe-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
          <nav aria-label={t("hotelThemes.cafeHomestay.sections")}>
            <a href="#rooms">{t("hotelThemes.cafeHomestay.rooms")}</a>
            <a href="#gallery">{t("hotelThemes.cafeHomestay.gallery")}</a>
            <a href="#location">{t("hotelThemes.cafeHomestay.location")}</a>
          </nav>
          <div className="cafe-actions">
            <div className="cafe-language" role="group" aria-label={t("hotelThemes.cafeHomestay.language")}>
              <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
              <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
            </div>
            {canBook && <a className="theme-book-button" href={bookingLink()}>{t("hotelThemes.cafeHomestay.bookDirect")}</a>}
          </div>
        </header>
        <main>
          {isVisible("hero") && (heroImage || heroCopy || hotelName) && (
            <section className="cafe-hero">
              <div className="cafe-hero-copy">
                <span className="cafe-kicker">{t("hotelThemes.cafeHomestay.heroKicker")}</span>
                <h1>{hotelName}</h1>
                {heroCopy && <p>{heroCopy}</p>}
                <a className="cafe-pill" href="#rooms">{t("hotelThemes.cafeHomestay.exploreRooms")} <span aria-hidden="true">↗</span></a>
                <CupDecoration />
              </div>
              {heroImage && (
                <div className="cafe-hero-photo">
                  <img
                    src={heroImage}
                    alt={hotelName}
                    style={media.find(item => item.is_hero)?.objectPosition ? { objectPosition: media.find(item => item.is_hero)?.objectPosition! } : undefined}
                  />
                  {media.find(item => item.is_hero)?.caption && (
                    <span className="theme-cover-caption">{media.find(item => item.is_hero)?.caption}</span>
                  )}
                  <span className="cafe-tape" aria-hidden="true" />
                </div>
              )}
              <LeafDecoration />
            </section>
          )}
          {isVisible("rooms") && roomTypes.length > 0 && (
            <section className="cafe-rooms" id="rooms">
              <div className="cafe-section-title">
                <span className="cafe-kicker">{t("hotelThemes.cafeHomestay.homeKicker")}</span>
                <h2>{t("hotelThemes.cafeHomestay.roomsTitle")}</h2>
              </div>
              <div className="cafe-room-grid">
                {roomTypes.map((room, index) => {
                  const image = media.filter(item => !item.is_hero && item.url)[index];
                  return (
                    <article className="cafe-room" key={room.id}>
                      {image && (
                        <div className="cafe-room-photo">
                          <img
                            src={image.url}
                            alt={image.caption || room.name}
                            style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined}
                          />
                        </div>
                      )}
                      <div className="cafe-room-info">
                        <div>
                          <h3>{canBook ? <a className="theme-room-link" href={bookingLink(room.id)}>{room.name}</a> : room.name}</h3>
                          <p>{t("hotelThemes.cafeHomestay.capacity", { capacity: room.capacity })}</p>
                        </div>
                        <strong>฿{Number(room.basePrice).toLocaleString()} <small>{t("hotelThemes.cafeHomestay.perNight")}</small></strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {isVisible("gallery") && gallery.length > 0 && (
            <section className="cafe-gallery" id="gallery">
              <div className="cafe-section-title">
                <span className="cafe-kicker">{t("hotelThemes.cafeHomestay.galleryKicker")}</span>
                <h2>{t("hotelThemes.cafeHomestay.galleryTitle")}</h2>
              </div>
              <div className="cafe-gallery-grid">
                {gallery.map((photo, index) => (
                  <figure key={`${photo.url}-${index}`} className={index % 2 ? "is-tilted" : ""}>
                    <span className="cafe-tape" aria-hidden="true" />
                    <img
                      src={photo.url}
                      alt={photo.caption || ""}
                      style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined}
                    />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}
          {isVisible("location") && hasLocation && (
            <section className="cafe-location" id="location">
              <div>
                <span className="cafe-kicker">{t("hotelThemes.cafeHomestay.comeFindUs")}</span>
                <h2>{t("hotelThemes.cafeHomestay.locationTitle")}</h2>
              </div>
              <div className="cafe-address">
                <MapPin size={19} aria-hidden="true" />
                <div>
                  <strong>{hotelName}</strong>
                  <p>{address}</p>
                </div>
              </div>
              {contacts}
              {locationMap}
              <LeafDecoration />
            </section>
          )}
        </main>
        <footer className="cafe-footer">
          <span>{hotelName}{hasLocation ? ` · ${address}` : ""}</span>
          <PoweredByHayhost label={t("hotelThemes.cafeHomestay.footerBooking")} />
        </footer>
      </div>
    </ThemeLanding>
  );
}
