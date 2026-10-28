import { ArrowRight, MapPin, Menu, X } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { HOTEL_THEMES, resolveHotelTheme } from "@/components/hotel-themes/registry";
import { ThemedLanding, hasThemeComponent } from "@/components/hotel-themes/ThemedLanding";
import { useTranslation } from "@/lib/i18n";

export const DEFAULT_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_ACCENT_COLOR = "#954831";

export default function PublicHotel({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);

  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug);
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
  });

  if (publicHotel.isLoading) {
    return <div className="public-page"><main className="public-loading">{t("publicHotel.loadingHotelDetails")}</main></div>;
  }

  if (publicHotel.error || !publicHotel.data) {
    return <div className="public-page"><main className="public-loading"><h1>{t("publicHotel.hotelUnavailableTitle")}</h1><p>{t("publicHotel.hotelUnavailableDesc")}</p><Link className="button public-button" href="/login">{t("publicHotel.hotelSignIn")}</Link></main></div>;
  }

  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;

  // hotel_site_config fallback: when no config row or table missing, use fixed copy/colors
  const siteConfig = siteConfigQuery.data ?? null;
  const heroCopy = siteConfig?.hero_copy ?? DEFAULT_HERO_COPY;
  const accentColor = siteConfig?.accent_color ?? DEFAULT_ACCENT_COLOR;
  const visibleSections = siteConfig?.visible_sections ?? null;
  const isVisible = (key: string) => visibleSections == null || visibleSections[key] !== false;

  const themeId = resolveHotelTheme(window.location.search);
  if (themeId && hasThemeComponent(themeId)) {
    return (
      <ThemedLanding
        themeId={themeId}
        fallback={<div className="public-page"><main className="public-loading">{t("publicHotel.loadingHotelDetails")}</main></div>}
        slug={slug}
        hotel={hotel}
        roomTypes={roomTypes}
        media={media}
        heroCopy={siteConfig?.hero_copy ?? null}
        primary={siteConfig?.accent_color ?? HOTEL_THEMES[themeId].primary}
        showBooking={isVisible("booking")}
      />
    );
  }

  const handleSelectRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    const bookElem = document.getElementById("book");
    if (bookElem) {
      bookElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="public-page">
      <header className="public-nav">
        <Link href={`/${hotel.slug}`} className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></Link>
        <nav className={menuOpen ? "is-open" : ""}>
          <a href="#stay">{t("publicHotel.navRooms")}</a>
          <a href="#location">{t("publicHotel.navLocation")}</a>
          <a href="#book" className="public-nav-cta" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>{t("publicHotel.navCheckDates")} <ArrowRight size={14} /></a>
        </nav>
        <button className="public-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("publicHotel.menuToggleAria")}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </header>
      <main>
        <section className="public-hero">
          {heroImage ? <img src={heroImage} alt={hotel.name} /> : <div className="public-hero-image-fallback" aria-hidden="true" />}
          <div className="public-hero-overlay" />
          <div className="public-hero-content">
            <div className="eyebrow light">{t("publicHotel.heroEyebrow")}</div>
            <h1>{hotel.name}</h1>
            <p>{heroCopy}</p>
            <a className="button public-button" href="#stay" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>{t("publicHotel.heroViewRooms")} <ArrowRight size={15} /></a>
          </div>
          <div className="public-hero-caption"><span>{t("publicHotel.heroCountry")}</span><span>{hotel.address}</span></div>
        </section>

        {isVisible("story") ? (
          <section className="public-intro" id="story">
            <div className="eyebrow">{t("publicHotel.storyEyebrow")}</div>
            <div>
              <h2>{t("publicHotel.storyStayAt")}<br /><i>{hotel.name}.</i></h2>
              <p>{t("publicHotel.storyDesc")}</p>
            </div>
          </section>
        ) : null}

        <section className="public-rooms" id="stay">
          <div className="public-section-heading">
            <div>
              <div className="eyebrow">{t("publicHotel.roomsEyebrow")}</div>
              <h2>{t("publicHotel.roomsTitle")}<br /><i>{t("publicHotel.roomsTitleHighlight")}</i></h2>
            </div>
            <p>{t("publicHotel.roomsDesc")}</p>
          </div>
          {roomTypes.length ? (
            <div className="public-room-grid">
              {roomTypes.map((room, index) => (
                <article
                  className="public-room-card cursor-pointer"
                  key={room.id}
                  onClick={() => handleSelectRoom(room.id)}
                >
                  <div className="public-room-image">
                    {media[index + 1]?.url ? (
                      <img src={media[index + 1].url} alt={media[index + 1].caption ?? room.name} />
                    ) : heroImage ? (
                      <img src={heroImage} alt="" />
                    ) : (
                      <div className="public-room-image-fallback" />
                    )}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="public-room-copy">
                    <div>
                      <h3>{room.name}</h3>
                      <span>{t("publicHotel.roomCapacityFrom", { capacity: room.capacity, price: Number(room.base_price).toLocaleString() })}</span>
                    </div>
                    <ArrowRight size={17} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-empty-state">{t("publicHotel.noRoomsPublished")}</div>
          )}
        </section>

        {isVisible("booking") ? (
          <section className="public-booking" id="book" style={{ background: "var(--pine)" }}>
            <div>
              <div className="eyebrow">{t("publicHotel.bookingEyebrow")}</div>
              <h2>{t("publicHotel.bookingTitle")}<br /><i>{t("publicHotel.bookingTitleHighlight")}</i></h2>
              <p>{t("publicHotel.bookingDesc")}</p>
            </div>

            <BookingFlow
              slug={slug}
              hotelName={hotel.name}
              roomTypes={roomTypes}
              accentColor={accentColor}
              preferredRoomTypeId={preferredRoomTypeId}
            />
          </section>
        ) : null}

        <section className="public-details" id="location">
          <div>
            <div className="eyebrow">{t("publicHotel.locationEyebrow")}</div>
            <h2>{t("publicHotel.locationTitle")}<br /><i>{t("publicHotel.locationTitleHighlight")}</i></h2>
          </div>
          <div className="location-card">
            <MapPin size={16} />
            <div>
              <strong>{hotel.name}</strong>
              <span>{hotel.address}</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <div className="public-brand"><span className="brand-mark"><span /></span><span>{hotel.name}</span></div>
        <span>© {new Date().getFullYear()} {hotel.name}</span>
        <span>{t("publicHotel.footerManagedSecurely")}</span>
      </footer>
    </div>
  );
}
