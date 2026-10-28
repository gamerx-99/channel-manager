import { useState } from "react";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { useTranslation } from "@/lib/i18n";
import { HOTEL_THEMES } from "./registry";
import {
  ThemeLanguageSwitch,
  ThemeMap,
  formatBaht,
  lowestRoomPrice,
  splitThemeMedia,
  themeVars,
  useThemeFonts,
  type HotelThemeLandingProps,
} from "./shared";
import "./lanna-teak.css";

/** Theme 01 Lanna Teak: cream and teak, arch-topped frames, Noto Serif + Noto Serif Thai over Be Vietnam Pro + Noto Sans Thai. */
export default function LannaTeakLanding({ slug, hotel, roomTypes, media, heroCopy, primary, showBooking }: HotelThemeLandingProps) {
  const { t, language } = useTranslation();
  useThemeFonts(HOTEL_THEMES["lanna-teak"].fontHref);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);
  const { hero, gallery } = splitThemeMedia(media);
  const introPhoto = gallery[0] ?? null;
  const fromPrice = lowestRoomPrice(roomTypes);
  const bookHref = showBooking ? "#book" : "#rooms";

  const chooseRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="theme-lanna-teak" lang={language} style={themeVars({ "--t-primary": primary })}>
      <header className="lt-header">
        <div className="lt-wrap lt-header-row">
          <a className="lt-brand" href="#top">{hotel.name}</a>
          <nav className="lt-nav" aria-label={hotel.name}>
            <a href="#rooms">{t("publicHotel.navRooms")}</a>
            {gallery.length > 0 && <a href="#gallery">{t("publicHotel.themeNavGallery")}</a>}
            <a href="#location">{t("publicHotel.navLocation")}</a>
          </nav>
          <div className="lt-header-actions">
            <ThemeLanguageSwitch className="lt-lang" />
            <a className="lt-button" href={bookHref}>{t("publicHotel.themeBookNow")}</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className={`lt-hero${hero ? "" : " lt-no-photo"}`}>
          {hero && <img src={hero.url} alt={hero.caption ?? hotel.name} />}
          <div className="lt-arch">
            <div className="lt-eyebrow">{t("publicHotel.themeDirectBooking")}</div>
            <h1>{hotel.name}</h1>
            {hotel.address && <p className="lt-arch-address">{hotel.address}</p>}
            <div className="lt-divider" aria-hidden="true"><span /></div>
            <div className="lt-arch-cta">
              {fromPrice != null && <span className="lt-price">{t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) })}</span>}
              <a className="lt-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
              <span className="lt-promptpay">{t("publicHotel.themePayByPromptPay")}</span>
            </div>
          </div>
        </section>

        {heroCopy && (
          <section className="lt-section">
            <div className={`lt-wrap${introPhoto ? " lt-intro" : ""}`}>
              {introPhoto && (
                <div className="lt-intro-photo"><img src={introPhoto.url} alt={introPhoto.caption ?? hotel.name} loading="lazy" /></div>
              )}
              <div>
                <div className="lt-eyebrow">{hotel.name}</div>
                <div className="lt-divider" style={{ margin: "16px 0" }} aria-hidden="true"><span /></div>
                <p>{heroCopy}</p>
              </div>
            </div>
          </section>
        )}

        <section className="lt-section lt-section-alt" id="rooms">
          <div className="lt-wrap">
            <div className="lt-section-head">
              <h2>{t("publicHotel.themeRoomsHeading")}</h2>
              <div className="lt-divider" aria-hidden="true"><span /></div>
            </div>
            {roomTypes.length ? (
              <div className="lt-rooms">
                {roomTypes.map((room, index) => {
                  const photo = media[index + 1] ?? null;
                  return (
                    <article className="lt-room" key={room.id} style={photo ? undefined : { gridTemplateColumns: "1fr" }}>
                      {photo && <div className="lt-room-photo"><img src={photo.url} alt={photo.caption ?? room.name} loading="lazy" /></div>}
                      <div className="lt-room-body">
                        <h3>{room.name}</h3>
                        <div className="lt-room-meta">{t("publicHotel.themeUpToGuests", { count: room.capacity })}</div>
                        <div className="lt-room-foot">
                          <span className="lt-room-price">{t("publicHotel.themeFromPerNight", { price: formatBaht(room.base_price) })}</span>
                          {showBooking && (
                            <button type="button" className="lt-button" onClick={() => chooseRoom(room.id)}>{t("publicHotel.themeBookNow")}</button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p style={{ textAlign: "center" }}>{t("publicHotel.noRoomsPublished")}</p>
            )}
          </div>
        </section>

        {gallery.length > 0 && (
          <section className="lt-section" id="gallery">
            <div className="lt-wrap">
              <div className="lt-section-head">
                <h2>{t("publicHotel.themeGalleryHeading")}</h2>
                <div className="lt-divider" aria-hidden="true"><span /></div>
              </div>
              <div className="lt-gallery">
                {gallery.map(item => (
                  <figure key={item.url}>
                    <div className="lt-gallery-photo"><img src={item.url} alt={item.caption ?? hotel.name} loading="lazy" /></div>
                    {item.caption && <figcaption>{item.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {showBooking && (
          <section className="lt-section lt-section-alt" id="book">
            <div className="lt-wrap">
              <div className="lt-section-head">
                <h2>{t("publicHotel.themeBookingHeading")}</h2>
                <div className="lt-divider" aria-hidden="true"><span /></div>
              </div>
              <div className="lt-booking">
                <BookingFlow
                  slug={slug}
                  hotelName={hotel.name}
                  roomTypes={roomTypes}
                  accentColor={primary}
                  preferredRoomTypeId={preferredRoomTypeId}
                />
              </div>
            </div>
          </section>
        )}

        <section className="lt-section" id="location">
          <div className="lt-wrap">
            <div className="lt-section-head">
              <h2>{t("publicHotel.themeLocationHeading")}</h2>
              <div className="lt-divider" aria-hidden="true"><span /></div>
            </div>
            <div className="lt-location">
              <div className="lt-location-card">
                <strong>{hotel.name}</strong>
                <p>{hotel.address}</p>
              </div>
              <ThemeMap className="lt-map" address={hotel.address} />
            </div>
          </div>
        </section>
      </main>

      <footer className="lt-footer">
        <div className="lt-wrap">
          <strong>{hotel.name}</strong>
          {hotel.address && <p>{hotel.address}</p>}
          <p>{t("publicHotel.themePoweredBy")}</p>
        </div>
      </footer>

      <div className="lt-mobile-bar">
        <span>{fromPrice != null ? t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) }) : hotel.name}</span>
        <a className="lt-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
      </div>
    </div>
  );
}
