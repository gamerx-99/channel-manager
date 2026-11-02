import React from "react";
import { MapPin } from "lucide-react";
import { ThemeLanding, type ThemeLandingProps, type ThemeLayoutProps } from "./ThemeLanding";

type Props = ThemeLayoutProps & Pick<ThemeLandingProps, "hotelName" | "accentColor">;

export default function MinimalWhiteLanding({ hotelName, accentColor, hotel, roomTypes, media, heroImage, heroCopy, language, setLanguage, isVisible, booking }: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, 8);
  const roomPhotos = media.filter(item => !item.is_hero && item.url);
  const address = hotel?.address?.trim() ?? "";

  return <ThemeLanding themeId="minimal-white" hotelName={hotelName} accentColor={accentColor}>
    <div className="minimal-page">
      <header className="minimal-header">
        <a className="minimal-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
        <nav aria-label="Hotel sections"><a href="#rooms">Rooms</a><a href="#gallery">Gallery</a><a href="#location">Location</a></nav>
        <div className="minimal-language" role="group" aria-label="Language switch">
          <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
        </div>
      </header>
      <main>
        {isVisible("hero") && (heroImage || heroCopy || hotelName) && <section className="minimal-hero">
          {heroImage && <img className="minimal-hero-image" src={heroImage} alt={hotelName} />}
          <div className="minimal-hero-copy"><h1>{hotelName}</h1>{heroCopy && <p>{heroCopy}</p>}</div>
          <span className="minimal-hero-index" aria-hidden="true">01 / 04</span>
        </section>}
        {isVisible("story") && heroCopy && <section className="minimal-intro"><span className="minimal-label">A place to stay</span><p>{heroCopy}</p></section>}
        {isVisible("rooms") && roomTypes.length > 0 && <section className="minimal-rooms" id="rooms"><div className="minimal-section-heading"><span className="minimal-label">01 — Stay</span><h2>Rooms</h2></div><div className="minimal-room-grid">{roomTypes.map((room, index) => {
          const photo = roomPhotos[index];
          return <article className="minimal-room" key={room.id}>
            {photo && <img className="minimal-room-image" src={photo.url} alt={photo.caption || room.name} />}
            <div className="minimal-room-info"><span className="minimal-label">Room {String(index + 1).padStart(2, "0")}</span><h3>{room.name}</h3><div className="minimal-room-meta"><span>Up to {room.capacity} guests</span><strong>฿{Number(room.basePrice).toLocaleString()} <small>/ night</small></strong></div></div>
          </article>;
        })}</div></section>}
        {isVisible("gallery") && gallery.length > 0 && <section className="minimal-gallery" id="gallery"><div className="minimal-section-heading"><span className="minimal-label">02 — Details</span><h2>Gallery</h2></div><div className="minimal-gallery-grid">{gallery.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.caption || ""} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></section>}
        {isVisible("booking") && booking}
        {isVisible("location") && address && <section className="minimal-location" id="location"><div><span className="minimal-label">03 — Find us</span><h2>Location</h2></div><div className="minimal-address"><MapPin size={18} aria-hidden="true" /><p>{address}</p></div></section>}
      </main>
      <footer className="minimal-footer"><span>{hotelName}{address ? ` · ${address}` : ""}</span><span>Booking powered by hayhost</span></footer>
    </div>
  </ThemeLanding>;
}
