import { ArrowRight, CheckCircle2, MapPin, Menu, X } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PaymentQR } from "@/components/PaymentQR";
import { useTranslation } from "@/lib/i18n";

export const DEFAULT_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_ACCENT_COLOR = "#954831";

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDayAfterTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export default function PublicHotel({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<string>(getTomorrowDateString());
  const [checkOut, setCheckOut] = useState<string>(getDayAfterTomorrowDateString());
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");
  const [guestEmail, setGuestEmail] = useState<string>("");
  const [specialRequests, setSpecialRequests] = useState<string>("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    booking_id: string;
    hotel_id: string;
    hotel_name: string;
    room_type_name: string;
    room_number?: string;
    check_in: string;
    check_out: string;
    nights: number;
    total_price: number;
    guest_name: string;
    has_promptpay: boolean;
    guest_phone?: string | null;
  } | null>(null);

  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug);
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
  });

  const isDatesValid = Boolean(checkIn && checkOut && checkOut > checkIn);

  const availabilityQuery = trpc.channelManager.publicHotelAvailability.useQuery(
    { slug, check_in: checkIn, check_out: checkOut },
    {
      enabled: Boolean(slug && isDatesValid && !publicHotel.isLoading && !publicHotel.error),
      staleTime: 30_000,
    },
  );

  const createBookingMutation = trpc.channelManager.createPublicBooking.useMutation({
    onSuccess: (data) => {
      setConfirmedBooking(data);
      setBookingError(null);
    },
    onError: (err) => {
      setBookingError(err.message || t("publicHotel.errorBookingFailed"));
    },
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

  const availableRoomTypes = availabilityQuery.data?.room_types ?? [];
  const selectedRoomType = availableRoomTypes.find(rt => rt.id === selectedRoomTypeId)
    ?? roomTypes.find(rt => rt.id === selectedRoomTypeId);

  const handleSelectRoom = (roomTypeId: string) => {
    setSelectedRoomTypeId(roomTypeId);
    setBookingError(null);
    const bookElem = document.getElementById("book");
    if (bookElem) {
      bookElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomTypeId) {
      setBookingError(t("publicHotel.errorSelectRoomType"));
      return;
    }
    if (!guestName.trim()) {
      setBookingError(t("publicHotel.errorEnterFullName"));
      return;
    }
    if (!isDatesValid) {
      setBookingError(t("publicHotel.errorSelectDates"));
      return;
    }

    setBookingError(null);
    createBookingMutation.mutate({
      slug,
      room_type_id: selectedRoomTypeId,
      check_in: checkIn,
      check_out: checkOut,
      guest_name: guestName.trim(),
      guest_email: guestEmail.trim() || undefined,
      guest_phone: guestPhone.trim() || undefined,
      special_requests: specialRequests.trim() || undefined,
    });
  };

  const handleResetBooking = () => {
    setConfirmedBooking(null);
    setBookingError(null);
    setSelectedRoomTypeId(null);
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setSpecialRequests("");
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

            {confirmedBooking ? (
              <div style={{ background: "#ffffff", color: "var(--ink)", padding: "28px", borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--pine)", marginBottom: "14px" }}>
                  <CheckCircle2 size={28} />
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{t("publicHotel.bookingConfirmedTitle")}</h3>
                </div>
                <p style={{ margin: "0 0 18px", color: "#5a6660", fontSize: "13px" }}>
                  {t("publicHotel.bookingConfirmedNotice", { name: confirmedBooking.guest_name, reference: confirmedBooking.booking_id.slice(0, 8).toUpperCase() })}
                </p>
                <div style={{ background: "#f6f4ee", padding: "16px", borderRadius: "8px", fontSize: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                  <div><strong>{t("publicHotel.confirmedProperty")}</strong> {confirmedBooking.hotel_name}</div>
                  <div><strong>{t("publicHotel.confirmedRoomType")}</strong> {confirmedBooking.room_type_name} {confirmedBooking.room_number ? `(${confirmedBooking.room_number})` : ''}</div>
                  <div><strong>{t("publicHotel.confirmedCheckIn")}</strong> {confirmedBooking.check_in}</div>
                  <div><strong>{t("publicHotel.confirmedCheckOut")}</strong> {confirmedBooking.check_out} ({confirmedBooking.nights > 1 ? t("publicHotel.confirmedNightsPlural", { count: confirmedBooking.nights }) : t("publicHotel.confirmedNights", { count: confirmedBooking.nights })})</div>
                  <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e2ddd0", paddingTop: "10px", fontSize: "14px", fontWeight: 700, color: "var(--pine)" }}>
                    {t("publicHotel.confirmedTotalStay", { amount: Number(confirmedBooking.total_price).toLocaleString() })}
                  </div>
                </div>

                {/* Phase 12B: Payment QR Step */}
                {confirmedBooking.has_promptpay ? (
                  <PaymentQR
                    bookingId={confirmedBooking.booking_id}
                    hotelId={confirmedBooking.hotel_id}
                    onSuccess={() => {
                      // Payment verified — show thank you and reset
                      setTimeout(handleResetBooking, 4000);
                    }}
                    onExpired={() => {
                      // Session expired — still allow booking another
                    }}
                  />
                ) : (
                  <p style={{ fontSize: "13px", color: "#789087", marginBottom: "16px" }}>
                    {t("publicHotel.contactDirectlyToPay")}
                  </p>
                )}

                <button
                  type="button"
                  className="button public-button"
                  onClick={handleResetBooking}
                  style={{ backgroundColor: accentColor, color: "#fff", borderColor: accentColor, width: "100%", marginTop: "12px" }}
                >
                  {t("publicHotel.bookAnotherStay")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} style={{ background: "rgba(255,255,255,0.06)", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)" }}>
                {bookingError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px 14px", borderRadius: "6px", fontSize: "12px", marginBottom: "16px" }}>
                    {bookingError}
                  </div>
                )}

                <div className="booking-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                    {t("publicHotel.checkInDate")}
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      required
                      style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" }}
                    />
                  </label>
                  <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                    {t("publicHotel.checkOutDate")}
                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      min={checkIn || new Date().toISOString().slice(0, 10)}
                      required
                      style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" }}
                    />
                  </label>
                </div>

                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>
                    {t("publicHotel.selectRoomType")}
                  </label>
                  {availabilityQuery.isLoading ? (
                    <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                      {t("publicHotel.checkingLiveRates")}
                    </div>
                  ) : availableRoomTypes.length > 0 ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {availableRoomTypes.map((rt) => {
                        const isSelected = selectedRoomTypeId === rt.id;
                        const isAvailable = rt.is_available;
                        return (
                          <div
                            key={rt.id}
                            onClick={() => isAvailable && setSelectedRoomTypeId(rt.id)}
                            style={{
                              padding: "12px 14px",
                              borderRadius: "7px",
                              background: isSelected ? "#ffffff" : isAvailable ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                              color: "var(--ink)",
                              border: isSelected ? `2px solid ${accentColor}` : "1px solid #dfd8cb",
                              cursor: isAvailable ? "pointer" : "not-allowed",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              opacity: isAvailable ? 1 : 0.65,
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: "13px", display: "block" }}>{rt.name}</strong>
                              <small style={{ color: "#6a7670", fontSize: "10px" }}>
                                {rt.rooms_available !== 1 ? t("publicHotel.roomsLeftPlural", { capacity: rt.capacity, count: rt.rooms_available }) : t("publicHotel.roomsLeft", { capacity: rt.capacity, count: rt.rooms_available })}
                                {rt.min_stay_violated ? t("publicHotel.minStayNote", { count: rt.min_stay_nights ?? 1 }) : ''}
                              </small>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <strong style={{ fontSize: "14px", color: "var(--pine)" }}>
                                ฿{Number(rt.total_price).toLocaleString()}
                              </strong>
                              <small style={{ display: "block", color: "#6a7670", fontSize: "9px" }}>
                                {rt.nights > 1 ? t("publicHotel.nightPriceDetailPlural", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() }) : t("publicHotel.nightPriceDetail", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() })}
                              </small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {roomTypes.map((rt) => (
                        <div
                          key={rt.id}
                          onClick={() => setSelectedRoomTypeId(rt.id)}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "7px",
                            background: selectedRoomTypeId === rt.id ? "#ffffff" : "rgba(255,255,255,0.92)",
                            color: "var(--ink)",
                            border: selectedRoomTypeId === rt.id ? `2px solid ${accentColor}` : "1px solid #dfd8cb",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: "13px" }}>{rt.name}</strong>
                            <small style={{ display: "block", color: "#6a7670", fontSize: "10px" }}>{t("publicHotel.fallbackCapacity", { capacity: rt.capacity })}</small>
                          </div>
                          <strong style={{ color: "var(--pine)" }}>฿{Number(rt.base_price).toLocaleString()}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRoomTypeId && (
                  <div style={{ background: "#fbfaf6", color: "var(--ink)", padding: "16px", borderRadius: "8px", marginBottom: "16px" }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pine)" }}>
                      {t("publicHotel.guestInformation")}
                    </h4>
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                          {t("publicHotel.fullName")}
                        </label>
                        <input
                          type="text"
                          placeholder={t("publicHotel.fullNamePlaceholder")}
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          required
                          style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "12px" }}
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                            {t("publicHotel.phoneNumber")}
                          </label>
                          <input
                            type="tel"
                            placeholder={t("publicHotel.phonePlaceholder")}
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "12px" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                            {t("publicHotel.emailAddress")}
                          </label>
                          <input
                            type="email"
                            placeholder={t("publicHotel.emailPlaceholder")}
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "12px" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!selectedRoomTypeId || createBookingMutation.isPending || !isDatesValid}
                  className="button public-button"
                  style={{
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                    color: "#ffffff",
                    width: "100%",
                    padding: "14px",
                    fontWeight: 700,
                    opacity: !selectedRoomTypeId || createBookingMutation.isPending || !isDatesValid ? 0.6 : 1,
                    cursor: !selectedRoomTypeId || createBookingMutation.isPending || !isDatesValid ? "not-allowed" : "pointer",
                  }}
                >
                  {createBookingMutation.isPending
                    ? t("publicHotel.confirmingReservation")
                    : selectedRoomType
                    ? t("publicHotel.confirmBookingWithPrice", { amount: Number((selectedRoomType as any).total_price ?? (selectedRoomType as any).base_price).toLocaleString() })
                    : t("publicHotel.selectRoomToProceed")}
                </button>
              </form>
            )}
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
