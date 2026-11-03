import React from "react";
import { ArrowDown, MapPin } from "lucide-react";
import { ThemeLanding, type ThemeLandingProps, type ThemeLayoutProps } from "./ThemeLanding";

type Props = ThemeLayoutProps & Pick<ThemeLandingProps, "hotelName" | "accentColor">;

function KanokDivider() {
  return <div className="lanna-divider" aria-hidden="true"><svg viewBox="0 0 120 20" focusable="false"><path d="M2 10h38c8 0 10-7 20-7s12 7 20 7h38M45 10c5 0 8 7 15 7s10-7 15-7M54 10l6-7 6 7-6 7z" /></svg></div>;
}

export default function LannaTeakLanding({ hotelName, accentColor, hotel, roomTypes, media, heroImage, heroCopy, language, setLanguage, isVisible, booking, t }: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, 8);
  const address = hotel?.address?.trim() ?? "";
  const hasLocation = Boolean(address);

  return <ThemeLanding themeId="lanna-teak" hotelName={hotelName} accentColor={accentColor}>
    <div className="lanna-page">
      <header className="lanna-header">
        <a className="lanna-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
        <nav aria-label={t("hotelThemes.lannaTeak.sections")}><a href="#stay">{t("hotelThemes.lannaTeak.rooms")}</a><a href="#gallery">{t("hotelThemes.lannaTeak.gallery")}</a><a href="#location">{t("hotelThemes.lannaTeak.location")}</a></nav>
        <div className="lanna-language" aria-label={t("hotelThemes.lannaTeak.language")}>
          <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
        </div>
      </header>

      <main>
        {isVisible("hero") && (heroImage || heroCopy || hotelName) && <section className="lanna-hero">
          <div className="lanna-hero-frame">
            {heroImage && <img src={heroImage} alt={hotelName} style={media.find(item => item.is_hero)?.objectPosition ? { objectPosition: media.find(item => item.is_hero)?.objectPosition! } : undefined} />}
            <div className="lanna-hero-wash" />
            <div className="lanna-hero-copy"><span className="lanna-kicker">{t("hotelThemes.lannaTeak.kicker")}</span><h1>{hotelName}</h1>{heroCopy && <p>{heroCopy}</p>}<a href="#stay" className="lanna-action">{t("hotelThemes.lannaTeak.exploreRooms")} <ArrowDown size={15} /></a></div>
          </div>
        </section>}

        <KanokDivider />

        {isVisible("rooms") && roomTypes.length > 0 && <section className="lanna-rooms" id="stay">
          <div className="lanna-section-title"><span className="lanna-kicker">{t("hotelThemes.lannaTeak.restWell")}</span><h2>{t("hotelThemes.lannaTeak.roomsTitle").split("|")[0]} <i>{t("hotelThemes.lannaTeak.roomsTitle").split("|")[1]}</i></h2></div>
          <div className="lanna-room-grid">{roomTypes.map((room, index) => {
            const image = media.filter(item => !item.is_hero && item.url)[index];
            return <article className="lanna-room" key={room.id}>
              {image && <div className="lanna-room-photo"><img src={image.url} alt={image.caption || room.name} style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined} /></div>}
              <div className="lanna-room-info"><div><h3>{room.name}</h3><p>{t("hotelThemes.lannaTeak.capacity", { capacity: room.capacity })}</p></div><strong>฿{Number(room.basePrice).toLocaleString()} <small>{t("hotelThemes.lannaTeak.perNight")}</small></strong></div>
            </article>;
          })}</div>
        </section>}

        {isVisible("gallery") && gallery.length > 0 && <section className="lanna-gallery" id="gallery"><div className="lanna-section-title"><span className="lanna-kicker">{t("hotelThemes.lannaTeak.galleryKicker")}</span><h2>{t("hotelThemes.lannaTeak.galleryTitle").split("|")[0]} <i>{t("hotelThemes.lannaTeak.galleryTitle").split("|")[1]}</i></h2></div><div className="lanna-gallery-grid">{gallery.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.caption || ""} style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></section>}

        {isVisible("booking") && booking}

        {isVisible("location") && hasLocation && <section className="lanna-location" id="location"><div><span className="lanna-kicker">{t("hotelThemes.lannaTeak.findWay")}</span><h2>{t("hotelThemes.lannaTeak.locationTitle")}</h2></div><div className="lanna-address"><MapPin size={18} /><div><strong>{hotelName}</strong><p>{address}</p></div></div></section>}
      </main>
      <footer className="lanna-footer"><span>{hotelName}{hasLocation ? ` · ${address}` : ""}</span><span>{t("hotelThemes.lannaTeak.footerBooking")}</span></footer>
    </div>
  </ThemeLanding>;
}
