import React from "react";
import { MapPin } from "lucide-react";
import { ThemeLanding, type ThemeLandingProps, type ThemeLayoutProps } from "./ThemeLanding";

type Props = ThemeLayoutProps & Pick<ThemeLandingProps, "hotelName" | "accentColor">;

function CupDecoration() {
  return <svg className="cafe-cup" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 24h34v17a13 13 0 0 1-13 13h-8a13 13 0 0 1-13-13V24Zm34 4h4a7 7 0 0 1 0 14h-5M19 17c-4-4 3-5 0-10m12 10c-4-4 3-5 0-10m12 10c-4-4 3-5 0-10" /></svg>;
}

function LeafDecoration() {
  return <svg className="cafe-leaf" viewBox="0 0 64 64" aria-hidden="true"><path d="M53 10C28 9 13 18 12 34c-1 12 11 18 21 11C44 36 44 22 53 10ZM12 55c7-14 17-22 31-31M25 42l-1-12m10 5 11-2" /></svg>;
}

export default function CafeHomestayLanding({ hotelName, accentColor, hotel, roomTypes, media, heroImage, heroCopy, language, setLanguage, isVisible, booking }: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, 8);
  const address = hotel?.address?.trim() ?? "";
  const hasLocation = Boolean(address);
  return <ThemeLanding themeId="cafe-homestay" hotelName={hotelName} accentColor={accentColor}>
    <div className="cafe-page">
      <header className="cafe-header">
        <a className="cafe-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
        <nav aria-label="Hotel sections"><a href="#rooms">Rooms</a><a href="#gallery">Gallery</a><a href="#location">Location</a></nav>
        <div className="cafe-language" role="group" aria-label="Language switch"><button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button><button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button></div>
      </header>
      <main>
        {isVisible("hero") && (heroImage || heroCopy || hotelName) && <section className="cafe-hero">
          <div className="cafe-hero-copy"><span className="cafe-kicker">A little pause, a little comfort</span><h1>{hotelName}</h1>{heroCopy && <p>{heroCopy}</p>}<a className="cafe-pill" href="#rooms">Explore rooms <span aria-hidden="true">↗</span></a><CupDecoration /></div>
          {heroImage && <div className="cafe-hero-photo"><img src={heroImage} alt={hotelName} /><span className="cafe-tape" aria-hidden="true" /></div>}
          <LeafDecoration />
        </section>}
        {isVisible("story") && heroCopy && <section className="cafe-intro"><span className="cafe-kicker">Sip slow, sleep soundly</span><h2>A softer kind of stay</h2><p>{heroCopy}</p></section>}
        {isVisible("rooms") && roomTypes.length > 0 && <section className="cafe-rooms" id="rooms"><div className="cafe-section-title"><span className="cafe-kicker">Make yourself at home</span><h2>Rooms for resting well</h2></div><div className="cafe-room-grid">{roomTypes.map((room, index) => {
          const image = media.filter(item => !item.is_hero && item.url)[index];
          return <article className="cafe-room" key={room.id}>{image && <div className="cafe-room-photo"><img src={image.url} alt={image.caption || room.name} /></div>}<div className="cafe-room-info"><div><h3>{room.name}</h3><p>Up to {room.capacity} guests</p></div><strong>฿{Number(room.basePrice).toLocaleString()} <small>/ night</small></strong></div></article>;
        })}</div></section>}
        {isVisible("gallery") && gallery.length > 0 && <section className="cafe-gallery" id="gallery"><div className="cafe-section-title"><span className="cafe-kicker">Little moments</span><h2>A glimpse of the stay</h2></div><div className="cafe-gallery-grid">{gallery.map((photo, index) => <figure key={`${photo.url}-${index}`} className={index % 2 ? "is-tilted" : ""}><span className="cafe-tape" aria-hidden="true" /><img src={photo.url} alt={photo.caption || ""} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></section>}
        {isVisible("booking") && booking}
        {isVisible("location") && hasLocation && <section className="cafe-location" id="location"><div><span className="cafe-kicker">Come find us</span><h2>Find your way here</h2></div><div className="cafe-address"><MapPin size={19} aria-hidden="true" /><div><strong>{hotelName}</strong><p>{address}</p></div></div><LeafDecoration /></section>}
      </main>
      <footer className="cafe-footer"><span>{hotelName}{hasLocation ? ` · ${address}` : ""}</span><span>Booking powered by hayhost</span></footer>
    </div>
  </ThemeLanding>;
}
