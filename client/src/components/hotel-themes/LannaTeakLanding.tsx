import React from "react";
import { ArrowDown, MapPin } from "lucide-react";
import { ThemeLanding, type ThemeLandingProps, type ThemeLayoutProps } from "./ThemeLanding";

type Props = ThemeLayoutProps & Pick<ThemeLandingProps, "hotelName" | "accentColor">;

function KanokDivider() {
  return <div className="lanna-divider" aria-hidden="true"><svg viewBox="0 0 120 20" focusable="false"><path d="M2 10h38c8 0 10-7 20-7s12 7 20 7h38M45 10c5 0 8 7 15 7s10-7 15-7M54 10l6-7 6 7-6 7z" /></svg></div>;
}

export default function LannaTeakLanding({ hotelName, accentColor, hotel, roomTypes, media, heroImage, heroCopy, language, setLanguage, isVisible, booking }: Props) {
  const gallery = media.filter(item => !item.is_hero && item.url).slice(0, 8);
  const address = hotel?.address?.trim() ?? "";
  const hasLocation = Boolean(address);

  return <ThemeLanding themeId="lanna-teak" hotelName={hotelName} accentColor={accentColor}>
    <div className="lanna-page">
      <header className="lanna-header">
        <a className="lanna-wordmark" href={`/${hotel?.slug ?? ""}`}>{hotelName}</a>
        <nav aria-label="Hotel sections"><a href="#stay">Rooms</a><a href="#gallery">Gallery</a><a href="#location">Location</a></nav>
        <div className="lanna-language" aria-label="Language">
          <button type="button" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={language !== "th"} onClick={() => setLanguage("en")}>EN</button>
        </div>
      </header>

      <main>
        {isVisible("hero") && (heroImage || heroCopy || hotelName) && <section className="lanna-hero">
          <div className="lanna-hero-frame">
            {heroImage && <img src={heroImage} alt={hotelName} />}
            <div className="lanna-hero-wash" />
            <div className="lanna-hero-copy"><span className="lanna-kicker">Lamphun · Northern Thailand</span><h1>{hotelName}</h1>{heroCopy && <p>{heroCopy}</p>}<a href="#stay" className="lanna-action">Explore rooms <ArrowDown size={15} /></a></div>
          </div>
        </section>}

        {isVisible("story") && heroCopy && <section className="lanna-intro">
          {heroImage && <div className="lanna-intro-photo"><img src={heroImage} alt={hotelName} /></div>}
          <div className="lanna-intro-copy"><span className="lanna-kicker">A place to pause</span><h2>A slower stay,<br /><i>rooted in place.</i></h2><p>{heroCopy}</p></div>
        </section>}
        <KanokDivider />

        {isVisible("rooms") && roomTypes.length > 0 && <section className="lanna-rooms" id="stay">
          <div className="lanna-section-title"><span className="lanna-kicker">Rest well</span><h2>Rooms for <i>your stay</i></h2></div>
          <div className="lanna-room-grid">{roomTypes.map((room, index) => {
            const image = media.filter(item => !item.is_hero && item.url)[index];
            return <article className="lanna-room" key={room.id}>
              {image && <div className="lanna-room-photo"><img src={image.url} alt={image.caption || room.name} /></div>}
              <div className="lanna-room-info"><div><h3>{room.name}</h3><p>Up to {room.capacity} guests</p></div><strong>฿{Number(room.basePrice).toLocaleString()} <small>/ night</small></strong></div>
            </article>;
          })}</div>
        </section>}

        {isVisible("gallery") && gallery.length > 0 && <section className="lanna-gallery" id="gallery"><div className="lanna-section-title"><span className="lanna-kicker">The feeling of here</span><h2>Small moments, <i>well kept.</i></h2></div><div className="lanna-gallery-grid">{gallery.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.caption || ""} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></section>}

        {isVisible("booking") && booking}

        {isVisible("location") && hasLocation && <section className="lanna-location" id="location"><div><span className="lanna-kicker">Find your way</span><h2>A welcome in<br /><i>Lamphun.</i></h2></div><div className="lanna-address"><MapPin size={18} /><div><strong>{hotelName}</strong><p>{address}</p></div></div></section>}
      </main>
      <footer className="lanna-footer"><span>{hotelName}{hasLocation ? ` · ${address}` : ""}</span><span>Booking powered by hayhost</span></footer>
    </div>
  </ThemeLanding>;
}
