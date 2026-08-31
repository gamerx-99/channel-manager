import { ArrowRight, Calendar, CheckCircle2, ChevronDown, Clock, MapPin, Menu, Phone, ShieldCheck, User, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PaymentQR } from "@/components/PaymentQR";

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
      setBookingError(err.message || "Unable to complete booking. Please try again.");
    },
  });

  if (publicHotel.isLoading) {
    return <div className="public-page"><main className="public-loading">Loading hotel details…</main></div>;
  }

  if (publicHotel.error || !publicHotel.data) {
    return <div className="public-page"><main className="public-loading"><h1>Hotel unavailable</h1><p>This property is not currently published or could not be found.</p><Link className="button public-button" href="/login">Hotel sign in</Link></main></div>;
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
      setBookingError("Please select a room type to book.");
      return;
    }
    if (!guestName.trim()) {
      setBookingError("Please enter your full name.");
      return;
    }
    if (!isDatesValid) {
      setBookingError("Please select valid check-in and check-out dates.");
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
          <a href="#stay">Rooms</a>
          <a href="#location">Location</a>
          <a href="#book" className="public-nav-cta" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>Check dates <ArrowRight size={14} /></a>
        </nav>
        <button className="public-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="เปิดเมนู">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </header>
      <main>
        <section className="public-hero">
          {heroImage ? <img src={heroImage} alt={hotel.name} /> : <div className="public-hero-image-fallback" aria-hidden="true" />}
          <div className="public-hero-overlay" />
          <div className="public-hero-content">
            <div className="eyebrow light">Independent hotel</div>
            <h1>{hotel.name}</h1>
            <p>{heroCopy}</p>
            <a className="button public-button" href="#stay" style={{ backgroundColor: accentColor, borderColor: accentColor } as React.CSSProperties}>View rooms <ArrowRight size={15} /></a>
          </div>
          <div className="public-hero-caption"><span>Thailand</span><span>{hotel.address}</span></div>
        </section>

        {isVisible("story") ? (
          <section className="public-intro" id="story">
            <div className="eyebrow">The hotel</div>
            <div>
              <h2>Stay at<br /><i>{hotel.name}.</i></h2>
              <p>Current property information is published directly by the hotel through its secure Channel Manager dashboard.</p>
            </div>
          </section>
        ) : null}

        <section className="public-rooms" id="stay">
          <div className="public-section-heading">
            <div>
              <div className="eyebrow">Rooms</div>
              <h2>Find your<br /><i>right room.</i></h2>
            </div>
            <p>Live room types and starting rates are managed by this property.</p>
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
                      <span>Up to {room.capacity} guests · From ฿{Number(room.base_price).toLocaleString()}</span>
                    </div>
                    <ArrowRight size={17} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-empty-state">Room details have not been published yet.</div>
          )}
        </section>

        {isVisible("booking") ? (
          <section className="public-booking" id="book" style={{ background: "var(--pine)" }}>
            <div>
              <div className="eyebrow">Your stay</div>
              <h2>Plan your<br /><i>next visit.</i></h2>
              <p>Direct guest reservation engine with real-time rate & availability calculation.</p>
            </div>

            {confirmedBooking ? (
              <div style={{ background: "#ffffff", color: "var(--ink)", padding: "28px", borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--pine)", marginBottom: "14px" }}>
                  <CheckCircle2 size={28} />
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Booking Confirmed!</h3>
                </div>
                <p style={{ margin: "0 0 18px", color: "#5a6660", fontSize: "13px" }}>
                  Thank you, <strong>{confirmedBooking.guest_name}</strong>. Your reservation reference is <strong style={{ color: "var(--pine)" }}>#{confirmedBooking.booking_id.slice(0, 8).toUpperCase()}</strong>.
                </p>
                <div style={{ background: "#f6f4ee", padding: "16px", borderRadius: "8px", fontSize: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                  <div><strong>Property:</strong> {confirmedBooking.hotel_name}</div>
                  <div><strong>Room Type:</strong> {confirmedBooking.room_type_name} {confirmedBooking.room_number ? `(${confirmedBooking.room_number})` : ''}</div>
                  <div><strong>Check-in:</strong> {confirmedBooking.check_in}</div>
                  <div><strong>Check-out:</strong> {confirmedBooking.check_out} ({confirmedBooking.nights} night{confirmedBooking.nights > 1 ? 's' : ''})</div>
                  <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e2ddd0", paddingTop: "10px", fontSize: "14px", fontWeight: 700, color: "var(--pine)" }}>
                    Total Stay Amount: ฿{Number(confirmedBooking.total_price).toLocaleString()}
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
                    กรุณาติดต่อที่พักโดยตรงเพื่อชำระเงิน
                  </p>
                )}

                <button
                  type="button"
                  className="button public-button"
                  onClick={handleResetBooking}
                  style={{ backgroundColor: accentColor, color: "#fff", borderColor: accentColor, width: "100%", marginTop: "12px" }}
                >
                  Book another stay
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
                    Check-in Date
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
                    Check-out Date
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
                    Select Room Type
                  </label>
                  {availabilityQuery.isLoading ? (
                    <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                      Checking live rates & availability...
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
                                Up to {rt.capacity} guests · {rt.rooms_available} room{rt.rooms_available !== 1 ? 's' : ''} left
                                {rt.min_stay_violated ? ` · Min stay ${rt.min_stay_nights} nights` : ''}
                              </small>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <strong style={{ fontSize: "14px", color: "var(--pine)" }}>
                                ฿{Number(rt.total_price).toLocaleString()}
                              </strong>
                              <small style={{ display: "block", color: "#6a7670", fontSize: "9px" }}>
                                {rt.nights} night{rt.nights > 1 ? 's' : ''} (฿{Number(rt.avg_nightly_price).toLocaleString()}/nt)
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
                            <small style={{ display: "block", color: "#6a7670", fontSize: "10px" }}>Capacity: {rt.capacity} guests</small>
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
                      Guest Information
                    </h4>
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                          Full Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Somchai Prasert"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          required
                          style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "12px" }}
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            placeholder="081-xxx-xxxx"
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "12px" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                            Email Address
                          </label>
                          <input
                            type="email"
                            placeholder="guest@example.com"
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
                    ? "Confirming Reservation..."
                    : selectedRoomType
                    ? `Confirm Booking · ฿${Number((selectedRoomType as any).total_price ?? (selectedRoomType as any).base_price).toLocaleString()}`
                    : "Select a room to proceed"}
                </button>
              </form>
            )}
          </section>
        ) : null}

        <section className="public-details" id="location">
          <div>
            <div className="eyebrow">Location</div>
            <h2>Find<br /><i>the hotel.</i></h2>
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
        <span>Property information is managed securely.</span>
      </footer>
    </div>
  );
}
