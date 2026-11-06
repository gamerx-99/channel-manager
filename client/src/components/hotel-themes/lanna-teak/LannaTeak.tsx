import React from "react";
import "./lanna-teak.css";
import { ChevronRight, MapPin } from "lucide-react";
import { ThemeLanding } from "../ThemeLanding";
import type { ThemeLandingProps } from "../ThemeProps";
import { PoweredByHayhost } from "../PoweredByHayhost";
import { MAX_WEBSITE_GALLERY_PHOTOS } from "@shared/hotelThemes";

function KanokDivider() {
  return <div className="lanna-divider" aria-hidden="true"><span /><i /><span /></div>;
}

type Props = ThemeLandingProps;

export default function LannaTeakLanding({
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
    <ThemeLanding themeId="lanna-teak" hotelName={hotelName} colors={colours}>
      <div className="lanna-page">
        <header className="lanna-header">
          <a className="lanna-mark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
          <nav aria-label={t("hotelThemes.lannaTeak.sections")}>
            <a href="#story">{t("hotelThemes.lannaTeak.story")}</a>
            <a href="#stay">{t("hotelThemes.lannaTeak.rooms")}</a>
            <a href="#gallery">{t("hotelThemes.lannaTeak.gallery")}</a>
            <a href="#location">{t("hotelThemes.lannaTeak.location")}</a>
          </nav>
          <div className="lanna-actions">
            <div className="lanna-language" role="group" aria-label={t("hotelThemes.lannaTeak.language")}>
              <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>ไทย</button>
              <span aria-hidden="true">·</span>
              <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
            </div>
            {canBook && <a className="lanna-reserve theme-book-button" href={bookingLink()}>{t("hotelThemes.lannaTeak.bookDirect")} <ChevronRight size={14} aria-hidden="true" /></a>}
          </div>
        </header>
        <main>
          {isVisible("hero") && (heroImage || heroCopy || hotelName) && (
            <section className="lanna-hero">
              <div className="lanna-hero-frame">
                {heroImage ? (
                  <img
                    className="lanna-hero-img"
                    src={heroImage}
                    alt={hotelName}
                    style={media.find(item => item.is_hero)?.objectPosition ? { objectPosition: media.find(item => item.is_hero)?.objectPosition! } : undefined}
                  />
                ) : <div className="lanna-hero-placeholder" />}
                <div className="lanna-hero-overlay" />
                <div className="lanna-hero-text">
                  <span className="lanna-kicker">{t("hotelThemes.lannaTeak.welcomeKicker")}</span>
                  <h1>{hotelName}</h1>
                  {heroCopy && <p>{heroCopy}</p>}
                  {canBook && <a className="lanna-hero-cta theme-book-button" href={bookingLink()}>{t("hotelThemes.lannaTeak.viewRooms")}</a>}
                </div>
                {media.find(item => item.is_hero)?.caption && (
                  <span className="theme-cover-caption">{media.find(item => item.is_hero)?.caption}</span>
                )}
              </div>
            </section>
          )}

          <KanokDivider />

          {isVisible("rooms") && roomTypes.length > 0 && (
            <section className="lanna-rooms" id="stay">
              <div className="lanna-section-title">
                <span className="lanna-kicker">{t("hotelThemes.lannaTeak.restWell")}</span>
                <h2>{t("hotelThemes.lannaTeak.roomsTitle").split("|")[0]} <i>{t("hotelThemes.lannaTeak.roomsTitle").split("|")[1]}</i></h2>
              </div>
              <div className="lanna-room-grid">
                {roomTypes.map((room, index) => {
                  const image = media.filter(item => !item.is_hero && item.url)[index];
                  return (
                    <article className="lanna-room" key={room.id}>
                      {image && (
                        <div className="lanna-room-photo">
                          <img
                            src={image.url}
                            alt={image.caption || room.name}
                            style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined}
                          />
                        </div>
                      )}
                      <div className="lanna-room-info">
                        <div>
                          <h3>{canBook ? <a className="theme-room-link" href={bookingLink(room.id)}>{room.name}</a> : room.name}</h3>
                          <p>{t("hotelThemes.lannaTeak.capacity", { capacity: room.capacity })}</p>
                        </div>
                        <strong>฿{Number(room.basePrice).toLocaleString()} <small>{t("hotelThemes.lannaTeak.perNight")}</small></strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {isVisible("gallery") && gallery.length > 0 && (
            <section className="lanna-gallery" id="gallery">
              <div className="lanna-section-title">
                <span className="lanna-kicker">{t("hotelThemes.lannaTeak.galleryKicker")}</span>
                <h2>{t("hotelThemes.lannaTeak.galleryTitle").split("|")[0]} <i>{t("hotelThemes.lannaTeak.galleryTitle").split("|")[1]}</i></h2>
              </div>
              <div className="lanna-gallery-grid">
                {gallery.map((photo, index) => (
                  <figure key={`${photo.url}-${index}`}>
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
            <section className="lanna-location" id="location">
              <div>
                <span className="lanna-kicker">{t("hotelThemes.lannaTeak.findWay")}</span>
                <h2>{t("hotelThemes.lannaTeak.locationTitle")}</h2>
              </div>
              <div className="lanna-address">
                <MapPin size={18} />
                <div>
                  <strong>{hotelName}</strong>
                  <p>{address}</p>
                </div>
              </div>
              {contacts}
              {locationMap}
            </section>
          )}
        </main>
        <footer className="lanna-footer">
          <span>{hotelName}{hasLocation ? ` · ${address}` : ""}</span>
          <PoweredByHayhost label={t("hotelThemes.lannaTeak.footerBooking")} />
        </footer>
      </div>
    </ThemeLanding>
  );
}
