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
import "./cafe-homestay.css";

/** Theme 04 Cafe Homestay: cream and coffee, polaroid photos, pill buttons, Epilogue + Be Vietnam Pro + Noto Sans Thai. */
export default function CafeHomestayLanding({ slug, hotel, roomTypes, media, heroCopy, primary, showBooking }: HotelThemeLandingProps) {
  const { t, language } = useTranslation();
  useThemeFonts(HOTEL_THEMES["cafe-homestay"].fontHref);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);
  const { hero, gallery } = splitThemeMedia(media);
  const collage = [hero, ...gallery].filter((item): item is NonNullable<typeof item> => item != null).slice(0, 3);
  const fromPrice = lowestRoomPrice(roomTypes);
  const bookHref = showBooking ? "#book" : "#rooms";

  const chooseRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="theme-cafe-homestay" lang={language} style={themeVars({ "--t-primary": primary })}>
      <header className="ch-header">
        <div className="ch-wrap ch-header-row">
          <a className="ch-brand" href="#top">{hotel.name}</a>
          <nav className="ch-nav" aria-label={hotel.name}>
            <a href="#rooms">{t("publicHotel.navRooms")}</a>
            {gallery.length > 0 && <a href="#gallery">{t("publicHotel.themeNavGallery")}</a>}
            <a href="#location">{t("publicHotel.navLocation")}</a>
          </nav>
          <div className="ch-header-actions">
            <ThemeLanguageSwitch className="ch-lang" />
            <a className="ch-button" href={bookHref}>{t("publicHotel.themeBookNow")}</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="ch-hero">
          <div className="ch-blob ch-blob-a" aria-hidden="true" />
          <div className="ch-blob ch-blob-b" aria-hidden="true" />
          <div className="ch-wrap">
            <div className={`ch-hero-grid${collage.length ? "" : " ch-no-photo"}`}>
              <div>
                <span className="ch-chip">{t("publicHotel.themeDirectBooking")}</span>
                <h1>{hotel.name}</h1>
                {heroCopy && <p className="ch-hero-intro">{heroCopy}</p>}
                {hotel.address && <span className="ch-chip ch-address">{hotel.address}</span>}
              </div>
              {collage.length > 0 && (
                <div className={`ch-collage ch-collage-${collage.length}`}>
                  {collage.map((item, index) => (
                    <figure className={`ch-polaroid ch-polaroid-${index}`} key={item.url}>
                      <img src={item.url} alt={item.caption ?? hotel.name} />
                      {item.caption && <figcaption>{item.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="ch-bar">
              {fromPrice != null && (
                <div className="ch-bar-price">
                  <small>{t("publicHotel.themeDirectBooking")}</small>
                  <strong>{t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) })}</strong>
                </div>
              )}
              <span className="ch-bar-note"><b aria-hidden="true">฿</b>{t("publicHotel.themePayByPromptPay")}</span>
              <a className="ch-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
            </div>
          </div>
        </section>

        <section className="ch-section ch-section-alt" id="rooms">
          <div className="ch-wrap">
            <div className="ch-section-head">
              <span className="ch-chip">{hotel.name}</span>
              <h2>{t("publicHotel.themeRoomsHeading")}</h2>
            </div>
            {roomTypes.length ? (
              <div className="ch-rooms">
                {roomTypes.map((room, index) => {
                  const photo = media[index + 1] ?? null;
                  return (
                    <article className="ch-room" key={room.id}>
                      {photo && <div className="ch-room-photo"><img src={photo.url} alt={photo.caption ?? room.name} loading="lazy" /></div>}
                      <div className="ch-room-body">
                        <h3>{room.name}</h3>
                        <span className="ch-chip" style={{ alignSelf: "flex-start" }}>{t("publicHotel.themeUpToGuests", { count: room.capacity })}</span>
                        <div className="ch-room-foot">
                          <span className="ch-room-price">{t("publicHotel.themeFromPerNight", { price: formatBaht(room.base_price) })}</span>
                          {showBooking && (
                            <button type="button" className="ch-button" onClick={() => chooseRoom(room.id)}>{t("publicHotel.themeBookNow")}</button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p>{t("publicHotel.noRoomsPublished")}</p>
            )}
          </div>
        </section>

        {gallery.length > 0 && (
          <section className="ch-section" id="gallery">
            <div className="ch-wrap">
              <div className="ch-section-head"><h2>{t("publicHotel.themeGalleryHeading")}</h2></div>
              <div className="ch-gallery">
                {gallery.map(item => (
                  <figure key={item.url}>
                    <img src={item.url} alt={item.caption ?? hotel.name} loading="lazy" />
                    {item.caption && <figcaption>{item.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {showBooking && (
          <section className="ch-section ch-section-alt" id="book">
            <div className="ch-wrap">
              <div className="ch-section-head"><h2>{t("publicHotel.themeBookingHeading")}</h2></div>
              <div className="ch-booking">
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

        <section className="ch-section" id="location">
          <div className="ch-wrap">
            <div className="ch-section-head"><h2>{t("publicHotel.themeLocationHeading")}</h2></div>
            <div className="ch-location">
              <div className="ch-location-card">
                <strong>{hotel.name}</strong>
                <p>{hotel.address}</p>
              </div>
              <ThemeMap className="ch-map" address={hotel.address} />
            </div>
          </div>
        </section>
      </main>

      <footer className="ch-footer">
        <div className="ch-wrap ch-footer-row">
          <div><strong>{hotel.name}</strong>{hotel.address && <div>{hotel.address}</div>}</div>
          <div>{t("publicHotel.themePoweredBy")}</div>
        </div>
      </footer>

      <div className="ch-mobile-bar">
        <span>{fromPrice != null ? t("publicHotel.themeFromPerNight", { price: formatBaht(fromPrice) }) : hotel.name}</span>
        <a className="ch-button" href={bookHref}>{t("publicHotel.themeCheckAvailability")}</a>
      </div>
    </div>
  );
}
