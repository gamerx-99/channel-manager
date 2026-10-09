import { ArrowRight, CheckCircle2, MapPin, Menu, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PaymentQR } from "@/components/PaymentQR";
import { BookingDateRangePicker } from "@/components/BookingDateRangePicker";
import { useTranslation } from "@/lib/i18n";
import { calculateServiceTotal } from "@shared/pricingModels";

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

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function PublicHotel({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [checkIn, setCheckIn] = useState<string | null>(getTomorrowDateString());
  const [checkOut, setCheckOut] = useState<string | null>(getDayAfterTomorrowDateString());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState<string[]>([]);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);
  const [heldBooking, setHeldBooking] = useState<{
    booking_id: string;
    hotel_id: string;
    room_id: string;
    expires_at: string;
    room_type_name: string;
    room_number: string;
    total_price: number;
    nights: number;
  } | null>(null);
  const [selectedServiceQty, setSelectedServiceQty] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug);
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
  });

  const isDatesValid = Boolean(checkIn && checkOut && checkOut > checkIn);
  const propertyChildRule = publicHotel.data?.roomTypes[0]?.child_rule ?? 'age';
  const childRulesConfigured = (publicHotel.data?.roomTypes.length ?? 0) > 0 && publicHotel.data!.roomTypes.every(roomType => roomType.child_rule === 'age' || roomType.child_rule_limit != null);
  const childMeasurements = children.filter(value => value !== '').map(value => propertyChildRule === 'age' ? { age: Number(value) } : { height_cm: Number(value) });
  const guestsValid = adults >= 1 && children.every(value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0);

  const availabilityQuery = trpc.channelManager.publicHotelAvailability.useQuery(
    { slug, check_in: checkIn ?? "", check_out: checkOut ?? "", adults, children: childMeasurements },
    {
      enabled: Boolean(slug && isDatesValid && wizardStep >= 2 && !publicHotel.isLoading && !publicHotel.error),
      staleTime: 30_000,
    },
  );

  const holdRoomTypeMutation = trpc.channelManager.holdRoomType.useMutation({
    onSuccess: (data) => {
      setHeldBooking(data);
      setWizardError(null);
      setWizardStep(3);
    },
    onError: (err) => setWizardError(err.message),
  });

  const servicesQuery = trpc.channelManager.listPublicHotelServices.useQuery(
    { slug },
    { enabled: wizardStep >= 3 },
  );

  const confirmDetailsMutation = trpc.channelManager.confirmBookingDetails.useMutation({
    onSuccess: (data) => {
      setConfirmedBookingId(data.booking_id);
      setWizardError(null);
      setWizardStep(5);
    },
    onError: (err) => setWizardError(err.message),
  });

  // Lazy-expiry countdown for the held/pending booking (steps 2-5).
  useEffect(() => {
    if (!heldBooking?.expires_at || wizardStep < 2 || wizardStep > 5) return;
    const tick = () => {
      const ms = new Date(heldBooking.expires_at).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) {
        setWizardError(t("publicHotel.holdExpiredRestart"));
        handleResetBooking();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [heldBooking?.expires_at, wizardStep, t]);

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

  const handleSelectRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    setWizardError(null);
    const bookElem = document.getElementById("book");
    if (bookElem) {
      bookElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleResetBooking = () => {
    setWizardStep(1);
    setCheckIn(getTomorrowDateString());
    setCheckOut(getDayAfterTomorrowDateString());
    setAdults(2);
    setChildren([]);
    setPreferredRoomTypeId(null);
    setHeldBooking(null);
    setSelectedServiceQty({});
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setSpecialRequests("");
    setConfirmedBookingId(null);
    setWizardError(null);
    setPaymentSuccess(false);
    setRemainingMs(0);
  };

  const handleHoldRoom = (roomTypeId: string) => {
    if (!checkIn || !checkOut || !isDatesValid) return;
    holdRoomTypeMutation.mutate({
      slug,
      room_type_id: roomTypeId,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children: childMeasurements,
    });
  };

  const handleConfirmDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!heldBooking) return;
    if (!guestName.trim()) {
      setWizardError(t("publicHotel.errorEnterFullName"));
      return;
    }

    const services = (servicesQuery.data ?? [])
      .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
      .map((s) => ({
        service_name: s.name,
        pricing_model: s.pricing_model as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME",
        unit_price: Number(s.unit_price),
        quantity: selectedServiceQty[s.id],
      }));

    setWizardError(null);
    confirmDetailsMutation.mutate({
      booking_id: heldBooking.booking_id,
      guest_name: guestName.trim(),
      guest_email: guestEmail.trim() || undefined,
      guest_phone: guestPhone.trim() || undefined,
      special_requests: specialRequests.trim() || undefined,
      services,
    });
  };

  const serviceLineTotal = (service: { name: string; pricing_model: string; unit_price: number | string }, qty: number) =>
    calculateServiceTotal(
      {
        service_name: service.name,
        pricing_model: service.pricing_model as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME",
        unit_price: Number(service.unit_price),
        quantity: qty,
      },
      heldBooking?.nights ?? 0,
    );

  const selectedServicesTotal = (servicesQuery.data ?? []).reduce(
    (sum, s) => sum + serviceLineTotal(s, selectedServiceQty[s.id] ?? 0),
    0,
  );

  const renderStepContent = () => {
    switch (wizardStep) {
      case 1:
        return (
          <div>
            <BookingDateRangePicker
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={({ checkIn: nextCheckIn, checkOut: nextCheckOut }) => {
                setCheckIn(nextCheckIn);
                setCheckOut(nextCheckOut);
              }}
              minDateIso={new Date().toISOString().slice(0, 10)}
              accentColor={accentColor}
            />
            <div style={{ width: "min(100%, 520px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
              <label style={{ color: "var(--public-text)", fontSize: 12, fontWeight: 600 }}>{t("publicHotel.adultsLabel")}
                <input aria-label={t("publicHotel.adultsLabel")} type="number" min="1" max="20" step="1" value={adults} onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} />
              </label>
              <label style={{ color: "var(--public-text)", fontSize: 12, fontWeight: 600 }}>{t("publicHotel.childrenLabel")}
                <select aria-label={t("publicHotel.childrenLabel")} value={children.length} disabled={!childRulesConfigured} onChange={event => setChildren(Array.from({ length: Number(event.target.value) }, (_, index) => children[index] ?? ""))}>
                  {Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              {!childRulesConfigured && <p style={{ gridColumn: "1 / -1", margin: 0 }}>{t("publicHotel.childRuleNotConfigured")}</p>}
              {children.map((value, index) => <label key={index} style={{ gridColumn: "1 / -1" }}>{t("publicHotel.childMeasurementLabel", { index: index + 1, measure: propertyChildRule === 'age' ? t("publicHotel.childAgeUnit") : t("publicHotel.childHeightUnit") })}
                <input type="number" min="0" max={propertyChildRule === 'age' ? 17 : 250} step={propertyChildRule === 'age' ? 1 : 0.5} value={value} onChange={event => setChildren(current => current.map((child, childIndex) => childIndex === index ? event.target.value : child))} />
              </label>)}
            </div>
            <div style={{ marginTop: "18px", textAlign: "right" }}>
              <button
                type="button"
                className="button public-button"
                disabled={!isDatesValid || !guestsValid}
                onClick={() => setWizardStep(2)}
                style={{
                  backgroundColor: accentColor,
                  borderColor: accentColor,
                  color: "#ffffff",
                  opacity: !isDatesValid || !guestsValid ? 0.6 : 1,
                  cursor: !isDatesValid || !guestsValid ? "not-allowed" : "pointer",
                }}
              >
                {t("publicHotel.wizardNext")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <div style={{ marginBottom: "18px" }}>
              {availabilityQuery.isLoading ? (
                <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                  {t("publicHotel.checkingLiveRates")}
                </div>
              ) : availableRoomTypes.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {availableRoomTypes.map((rt) => {
                    const isPreferred = preferredRoomTypeId === rt.id;
                    const isAvailable = rt.is_available;
                    return (
                      <div
                        key={rt.id}
                        onClick={() => isAvailable && handleHoldRoom(rt.id)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "7px",
                          background: isPreferred ? "#ffffff" : isAvailable ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                          color: "var(--ink)",
                          border: isPreferred ? `2px solid ${accentColor}` : "1px solid #dfd8cb",
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
                            {rt.rooms_available !== 1
                              ? t("publicHotel.roomsLeftPlural", { capacity: rt.capacity, count: rt.rooms_available })
                              : t("publicHotel.roomsLeft", { capacity: rt.capacity, count: rt.rooms_available })}
                            {rt.min_stay_violated ? t("publicHotel.minStayNote", { count: rt.min_stay_nights ?? 1 }) : ""}
                          </small>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ fontSize: "14px", color: "var(--pine)" }}>
                            ฿{Number(rt.total_price).toLocaleString()}
                          </strong>
                          <small style={{ display: "block", color: "#6a7670", fontSize: "9px" }}>
                            {rt.nights > 1
                              ? t("publicHotel.nightPriceDetailPlural", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() })
                              : t("publicHotel.nightPriceDetail", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() })}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div role="status" style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                  {t("publicHotel.noRoomsFitGuests")}
                </div>
              )}
            </div>
            {holdRoomTypeMutation.isPending && (
              <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px", marginBottom: "16px" }}>
                {t("publicHotel.holdingRoom")}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(1)}>
                {t("publicHotel.wizardBack")}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <p style={{ color: "#d2e8de", fontSize: "12px", marginBottom: "12px" }}>
              {t("publicHotel.holdExpiresIn", { time: formatCountdown(remainingMs) })}
            </p>
            <h4 style={{ color: "#ffffff", fontSize: "14px", margin: "0 0 12px" }}>{t("publicHotel.stepServicesTitle")}</h4>
            {servicesQuery.isLoading ? (
              <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px", marginBottom: "16px" }}>
                {t("publicHotel.checkingLiveRates")}
              </div>
            ) : (servicesQuery.data ?? []).length === 0 ? (
              <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px", marginBottom: "16px" }}>
                {t("publicHotel.noServicesAvailable")}
              </div>
            ) : (
              <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
                {(servicesQuery.data ?? []).map((s) => {
                  const qty = selectedServiceQty[s.id] ?? 0;
                  const checked = qty > 0;
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "7px",
                        background: "rgba(255,255,255,0.92)",
                        color: "var(--ink)",
                        border: "1px solid #dfd8cb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedServiceQty((prev) => ({
                              ...prev,
                              [s.id]: e.target.checked ? 1 : 0,
                            }));
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div>
                          <strong style={{ fontSize: "13px", display: "block" }}>{s.name}</strong>
                          <small style={{ color: "#6a7670", fontSize: "10px" }}>{s.pricing_model}</small>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "10px" }}>
                        {checked && (
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "#3a4642" }}>
                            {t("publicHotel.serviceQtyLabel")}
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => {
                                const next = Math.max(1, parseInt(e.target.value || "1", 10));
                                setSelectedServiceQty((prev) => ({ ...prev, [s.id]: next }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: "60px", marginLeft: "6px", padding: "4px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "12px" }}
                            />
                          </label>
                        )}
                        <strong style={{ fontSize: "13px", color: "var(--pine)", minWidth: "70px" }}>
                          ฿{serviceLineTotal(s, qty).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(2)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button type="button" className="button public-button" onClick={() => setWizardStep(4)} style={{ backgroundColor: accentColor, borderColor: accentColor, color: "#ffffff" }}>
                {(servicesQuery.data ?? []).length === 0 ? t("publicHotel.wizardSkip") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <form onSubmit={handleConfirmDetails} style={{ display: "grid", gap: "12px" }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#e8eee8" }}>
              {t("publicHotel.guestInformation")}
            </h4>
            <div>
              <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                {t("publicHotel.fullName")}
              </label>
              <input
                type="text"
                placeholder={t("publicHotel.fullNamePlaceholder")}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                  {t("publicHotel.phoneNumber")}
                </label>
                <input
                  type="tel"
                  placeholder={t("publicHotel.phonePlaceholder")}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                  {t("publicHotel.emailAddress")}
                </label>
                <input
                  type="email"
                  placeholder={t("publicHotel.emailPlaceholder")}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: "block", color: "#e8eee8", fontSize: "11px", fontWeight: 600 }}>
                {t("publicHotel.specialRequestsLabel")}
              </label>
              <textarea
                placeholder={t("publicHotel.specialRequestsPlaceholder")}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={3}
                style={{ display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(3)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="submit"
                disabled={confirmDetailsMutation.isPending}
                className="button public-button"
                style={{
                  backgroundColor: accentColor,
                  borderColor: accentColor,
                  color: "#ffffff",
                  opacity: confirmDetailsMutation.isPending ? 0.6 : 1,
                  cursor: confirmDetailsMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {confirmDetailsMutation.isPending ? t("publicHotel.confirmingReservation") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </form>
        );

      case 5:
        return (
          <div style={{ background: "rgba(255,255,255,0.06)", padding: "20px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: "14px", color: "#ffffff" }}>{t("publicHotel.summaryTitle")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", color: "#e8eee8", marginBottom: "16px" }}>
              <div><strong>{t("publicHotel.summaryProperty")}</strong> {hotel.name}</div>
              <div><strong>{t("publicHotel.summaryRoomType")}</strong> {heldBooking?.room_type_name} {heldBooking?.room_number ? `(${heldBooking.room_number})` : ""}</div>
              <div><strong>{t("publicHotel.summaryCheckIn")}</strong> {checkIn}</div>
              <div><strong>{t("publicHotel.summaryCheckOut")}</strong> {checkOut} ({heldBooking?.nights ?? 0} {t("publicHotel.confirmedNights", { count: heldBooking?.nights ?? 0 })})</div>
              <div><strong>{t("publicHotel.summaryGuests")}</strong> {t("publicHotel.adultsLabel")}: {adults}, {t("publicHotel.childrenLabel")}: {children.length}</div>
            </div>
            {(servicesQuery.data ?? []).some((s) => (selectedServiceQty[s.id] ?? 0) > 0) && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#e8eee8", fontWeight: 600, marginBottom: "8px" }}>{t("publicHotel.summaryServices")}</div>
                <div style={{ display: "grid", gap: "6px" }}>
                  {(servicesQuery.data ?? [])
                    .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
                    .map((s) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#e8eee8" }}>
                        <span>{s.name} x {selectedServiceQty[s.id]}</span>
                        <span>฿{serviceLineTotal(s, selectedServiceQty[s.id]).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>
              <span>{t("publicHotel.summaryTotal")}</span>
              <span>฿{(confirmDetailsMutation.data?.amount ?? (heldBooking?.total_price ?? 0) + selectedServicesTotal).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(4)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="button"
                className="button public-button"
                onClick={() => setWizardStep(6)}
                style={{ backgroundColor: accentColor, borderColor: accentColor, color: "#ffffff" }}
              >
                {t("publicHotel.confirmAndPay")}
              </button>
            </div>
          </div>
        );

      case 6:
        return (
          <div>
            {paymentSuccess ? (
              <div style={{ background: "#ffffff", color: "var(--ink)", padding: "28px", borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--pine)", marginBottom: "14px" }}>
                  <CheckCircle2 size={28} />
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{t("publicHotel.bookingConfirmedTitle")}</h3>
                </div>
                <p style={{ margin: "0 0 18px", color: "#5a6660", fontSize: "13px" }}>
                  {t("publicHotel.bookingConfirmedNotice", { name: guestName.trim(), reference: (confirmedBookingId ?? heldBooking?.booking_id ?? "").slice(0, 8).toUpperCase() })}
                </p>
                <div style={{ background: "#f6f4ee", padding: "16px", borderRadius: "8px", fontSize: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                  <div><strong>{t("publicHotel.confirmedProperty")}</strong> {hotel.name}</div>
                  <div><strong>{t("publicHotel.confirmedRoomType")}</strong> {heldBooking?.room_type_name} {heldBooking?.room_number ? `(${heldBooking.room_number})` : ""}</div>
                  <div><strong>{t("publicHotel.confirmedCheckIn")}</strong> {checkIn}</div>
                  <div><strong>{t("publicHotel.confirmedCheckOut")}</strong> {checkOut} ({(heldBooking?.nights ?? 0) > 1 ? t("publicHotel.confirmedNightsPlural", { count: heldBooking?.nights ?? 0 }) : t("publicHotel.confirmedNights", { count: heldBooking?.nights ?? 0 })})</div>
                  <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e2ddd0", paddingTop: "10px", fontSize: "14px", fontWeight: 700, color: "var(--pine)" }}>
                    {t("publicHotel.confirmedTotalStay", { amount: (confirmDetailsMutation.data?.amount ?? heldBooking?.total_price ?? 0).toLocaleString() })}
                  </div>
                </div>
                <button
                  type="button"
                  className="button public-button"
                  onClick={handleResetBooking}
                  style={{ backgroundColor: accentColor, color: "#fff", borderColor: accentColor, width: "100%" }}
                >
                  {t("publicHotel.bookAnotherStay")}
                </button>
              </div>
            ) : (
              <div>
                {heldBooking && (
                  <PaymentQR
                    bookingId={heldBooking.booking_id}
                    hotelId={heldBooking.hotel_id}
                    onSuccess={() => setPaymentSuccess(true)}
                    onExpired={() => {
                      setWizardError(t("publicHotel.holdExpiredRestart"));
                      handleResetBooking();
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
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

            <div style={{ background: "rgba(255,255,255,0.06)", padding: "24px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)" }}>
              <div style={{ color: "#e8eee8", fontSize: "11px", fontWeight: 600, marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t("publicHotel.wizardStepOf", { step: wizardStep, total: 6 })}
              </div>

              {wizardError && (
                <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px 14px", borderRadius: "6px", fontSize: "12px", marginBottom: "16px" }}>
                  {wizardError}
                </div>
              )}

              {renderStepContent()}
            </div>
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
