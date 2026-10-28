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
import "./minimal-white.css";

/** Theme 02 Minimal White: white and stone surfaces, hairline dividers, IBM Plex Sans + IBM Plex Sans Thai. */
export default function MinimalWhiteLanding({ slug, hotel, roomTypes, media, heroCopy, primary, showBooking }: HotelThemeLandingProps) {
  const { t, language } = useTranslation();
  useThemeFonts(HOTEL_THEMES["minimal-white"].fontHref);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);
  const { hero, gallery } = splitThemeMedia(media);
  const fromPrice = lowestRoomPrice(roomTypes);
  const bookHref = showBooking ? "#book" : "#rooms";

  const chooseRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="theme-minimal-white" lang={language} style={themeVars({ "--t-primary": primary })}>
      <header className="mw-header">
        <div className="mw-wrap mw-header-row">
          <a className="mw-brand" href="#top">{hotel.name}</a>
          <nav className="mw-nav mw-label" aria-label={hotel.name}>
            <a href="#rooms">{t("publicHotel.navRooms")}</a>
            {gallery.length > 0 && <a href="#gallery">{t("publicHotel.themeNavGallery")}</a>}
            <a href="#location">{t("publicHotel.navLocation")}</a>
          </nav>
          <div className="mw-header-actions">
            <ThemeLanguageSwitch className="mw-lang mw-label" />
            <a className="mw-button" href={bookHref}>{t("publicHotel.themeBookNow")}</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mw-hero">
          <div className={`mw-hero-grid${hero ? "" : " mw-no-photo"}`}>
            <div className="mw-hero-copy">
              <div>
                {hotel.address && <div className="mw-label">{hotel.address}</div>}
                <h1>{hotel.name}</h1>
                {heroCopy && <p className="mw-hero-intro">{heroCopy}</p>}
              </div>
              <div className="mw-reserve">
                {fromPrice != null && (
                  <div className="mw-reserve-price">{t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) })}</div>
                )}
                <a className="mw-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
                <div className="mw-reserve-note">
                  <span className="mw-label">{t("publicHotel.themeDirectBooking")}</span>
                  <span>{t("publicHotel.themePayByPromptPay")}</span>
                </div>
              </div>
            </div>
            {hero && (
              <div className="mw-hero-photo">
                <img src={hero.url} alt={hero.caption ?? hotel.name} />
              </div>
            )}
          </div>
        </section>

        <section className="mw-section" id="rooms">
          <div className="mw-wrap">
            <div className="mw-section-head"><h2>{t("publicHotel.themeRoomsHeading")}</h2></div>
            {roomTypes.length ? (
              <div className="mw-rooms">
                {roomTypes.map((room, index) => {
                  const photo = media[index + 1] ?? null;
                  return (
                    <article className="mw-room" key={room.id}>
                      {photo && (
                        <div className="mw-room-photo"><img src={photo.url} alt={photo.caption ?? room.name} /></div>
                      )}
                      <div className="mw-room-title">
                        <h3>{room.name}</h3>
                        <span className="mw-label">{t("publicHotel.themeUpToGuests", { count: room.capacity })}</span>
                      </div>
                      <p>{t("publicHotel.themeFromPerNight", { price: formatBaht(room.base_price) })}</p>
                      {showBooking && (
                        <button type="button" className="mw-room-book" onClick={() => chooseRoom(room.id)}>{t("publicHotel.themeBookNow")}</button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mw-label">{t("publicHotel.noRoomsPublished")}</p>
            )}
          </div>
        </section>

        {gallery.length > 0 && (
          <section className="mw-section mw-section-alt" id="gallery">
            <div className="mw-wrap"><div className="mw-section-head"><h2>{t("publicHotel.themeGalleryHeading")}</h2></div></div>
            <div className="mw-gallery">
              {gallery.map((item, index) => (
                <figure key={item.url}>
                  <div className="mw-gallery-photo"><img src={item.url} alt={item.caption ?? hotel.name} loading="lazy" /></div>
                  {item.caption && <figcaption>{String(index + 1).padStart(2, "0")}. {item.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        {showBooking && (
          <section className="mw-section" id="book">
            <div className="mw-wrap mw-booking">
              <div className="mw-section-head" style={{ alignSelf: "start" }}><h2>{t("publicHotel.themeBookingHeading")}</h2></div>
              <BookingFlow
                slug={slug}
                hotelName={hotel.name}
                roomTypes={roomTypes}
                accentColor={primary}
                preferredRoomTypeId={preferredRoomTypeId}
              />
            </div>
          </section>
        )}

        <section className="mw-section mw-section-alt" id="location">
          <div className="mw-wrap mw-location">
            <div>
              <div className="mw-section-head"><h2>{t("publicHotel.themeLocationHeading")}</h2></div>
              <div className="mw-label">{t("publicHotel.themeAddressLabel")}</div>
              <p>{hotel.address}</p>
            </div>
            <ThemeMap className="mw-map" address={hotel.address} />
          </div>
        </section>
      </main>

      <footer className="mw-footer">
        <div className="mw-wrap mw-footer-row">
          <div><strong>{hotel.name}</strong>{hotel.address && <> · {hotel.address}</>}</div>
          <div>{t("publicHotel.themePoweredBy")}</div>
        </div>
      </footer>

      <div className="mw-mobile-bar">
        <span>{fromPrice != null ? t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) }) : hotel.name}</span>
        <a className="mw-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
      </div>
    </div>
  );
}
