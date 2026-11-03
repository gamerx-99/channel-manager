import React from "react";
import { MapPin } from "lucide-react";
import { ThemeLanding, type ThemeLandingProps, type ThemeLayoutProps } from "./ThemeLanding";

type Props = ThemeLayoutProps & Pick<ThemeLandingProps, "hotelName" | "accentColor">;

export default function MinimalWhiteLanding({ hotelName, accentColor, hotel, roomTypes, media, heroImage, heroCopy, language, setLanguage, isVisible, booking, t }: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, 8);
  const roomPhotos = media.filter(item => !item.is_hero && item.url);
  const address = hotel?.address?.trim() ?? "";

  return <ThemeLanding themeId="minimal-white" hotelName={hotelName} accentColor={accentColor}>
    <div className="minimal-page">
      <header className="minimal-header">
        <a className="minimal-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
        <nav aria-label={t("hotelThemes.minimalWhite.sections")}><a href="#rooms">{t("hotelThemes.minimalWhite.rooms")}</a><a href="#gallery">{t("hotelThemes.minimalWhite.gallery")}</a><a href="#location">{t("hotelThemes.minimalWhite.location")}</a></nav>
        <div className="minimal-language" role="group" aria-label={t("hotelThemes.minimalWhite.language")}>
          <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
        </div>
      </header>
      <main>
        {isVisible("hero") && (heroImage || heroCopy || hotelName) && <section className="minimal-hero">
          {heroImage && <img className="minimal-hero-image" src={heroImage} alt={hotelName} style={media.find(item => item.is_hero)?.objectPosition ? { objectPosition: media.find(item => item.is_hero)?.objectPosition! } : undefined} />}
          <div className="minimal-hero-copy"><h1>{hotelName}</h1>{heroCopy && <p>{heroCopy}</p>}</div>
        </section>}
        {isVisible("rooms") && roomTypes.length > 0 && <section className="minimal-rooms" id="rooms"><div className="minimal-section-heading"><span className="minimal-label">{t("hotelThemes.minimalWhite.stay")}</span><h2>{t("hotelThemes.minimalWhite.rooms")}</h2></div><div className="minimal-room-grid">{roomTypes.map((room, index) => {
          const photo = roomPhotos[index];
          return <article className="minimal-room" key={room.id}>
            {photo && <img className="minimal-room-image" src={photo.url} alt={photo.caption || room.name} style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined} />}
            <div className="minimal-room-info"><span className="minimal-label">{t("hotelThemes.minimalWhite.room", { number: String(index + 1).padStart(2, "0") })}</span><h3>{room.name}</h3><div className="minimal-room-meta"><span>{t("hotelThemes.minimalWhite.capacity", { capacity: room.capacity })}</span><strong>฿{Number(room.basePrice).toLocaleString()} <small>{t("hotelThemes.minimalWhite.perNight")}</small></strong></div></div>
          </article>;
        })}</div></section>}
        {isVisible("gallery") && gallery.length > 0 && <section className="minimal-gallery" id="gallery"><div className="minimal-section-heading"><span className="minimal-label">{t("hotelThemes.minimalWhite.details")}</span><h2>{t("hotelThemes.minimalWhite.gallery")}</h2></div><div className="minimal-gallery-grid">{gallery.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.caption || ""} style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></section>}
        {isVisible("booking") && booking}
        {isVisible("location") && address && <section className="minimal-location" id="location"><div><span className="minimal-label">{t("hotelThemes.minimalWhite.findUs")}</span><h2>{t("hotelThemes.minimalWhite.location")}</h2></div><div className="minimal-address"><MapPin size={18} aria-hidden="true" /><p>{address}</p></div></section>}
      </main>
      <footer className="minimal-footer"><span>{hotelName}{address ? ` · ${address}` : ""}</span><span>{t("hotelThemes.minimalWhite.footerBooking")}</span></footer>
    </div>
  </ThemeLanding>;
}
