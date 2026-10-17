import { ArrowRight, BedDouble, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Menu, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PaymentQR } from "@/components/PaymentQR";
import { BookingDateRangePicker } from "@/components/BookingDateRangePicker";
import { en, useTranslation } from "@/lib/i18n";
import { calculateServiceTotal } from "@shared/pricingModels";

export const DEFAULT_ACCENT_COLOR = "#334155";

/**
 * Server billing decision reason -> i18n key. Keys match
 * SubscriptionDecision['reason'] in @shared/billing/subscriptionAccess.
 */
export const BILLING_REASON_KEYS: Record<string, string> = {
  no_subscription: "publicHotel.billingNoSubscription",
  trial_expired: "publicHotel.billingTrialExpired",
  period_ended: "publicHotel.billingPeriodEnded",
  not_paying: "publicHotel.billingNotPaying",
  suspended: "publicHotel.billingSuspended",
  deleted: "publicHotel.billingUnavailable",
  default: "publicHotel.billingNotPaying",
};

const DEFAULT_ATMOSPHERE_PHOTOS = [
  {
    id: "default-1",
    url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto1",
  },
  {
    id: "default-2",
    url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto2",
  },
  {
    id: "default-3",
    url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto3",
  },
  {
    id: "default-4",
    url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto4",
  },
  {
    id: "default-5",
    url: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto5",
  },
  {
    id: "default-6",
    url: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80",
    captionKey: "publicHotel.defaultAtmospherePhoto6",
  },
];

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

function getAccentForeground(color: string): "#ffffff" | "#1f2933" {
  const hex = color.replace("#", "");
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(hex)) return "#ffffff";
  const expanded = hex.length === 3 ? hex.split("").map(part => part + part).join("") : hex;
  const channels = [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? "#1f2933" : "#ffffff";
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
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

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

  // Keep hooks above the loading/error returns so query transitions preserve hook order.
  useEffect(() => {
    if (activeLightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveLightboxIndex(null);
      if (e.key === "ArrowRight") {
        setActiveLightboxIndex(prev => (prev === null ? null : (prev + 1) % 6));
      }
      if (e.key === "ArrowLeft") {
        setActiveLightboxIndex(prev => (prev === null ? null : (prev - 1 + 6) % 6));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLightboxIndex]);

  if (publicHotel.isLoading) {
    return <div className="public-page"><main className="public-loading">{t("publicHotel.loadingHotelDetails")}</main></div>;
  }

  if (publicHotel.error || !publicHotel.data) {
    return <div className="public-page"><main className="public-loading"><h1>{t("publicHotel.hotelUnavailableTitle")}</h1><p>{t("publicHotel.hotelUnavailableDesc")}</p><Link className="button public-button" href="/login">{t("publicHotel.hotelSignIn")}</Link></main></div>;
  }

  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;
  const roomPhotoFor = (roomName: string) => media.find(
    item => item.caption?.trim().toLocaleLowerCase() === roomName.trim().toLocaleLowerCase(),
  );

  // hotel_site_config fallback: when no config row or table missing, use fixed copy/colors
  const siteConfig = siteConfigQuery.data ?? null;
  const configuredHeroCopy = siteConfig?.hero_copy?.trim();
  const heroCopy = configuredHeroCopy && configuredHeroCopy !== en.publicHotel.defaultHeroCopy
    ? configuredHeroCopy
    : t("publicHotel.defaultHeroCopy");
  const accentColor = siteConfig?.accent_color ?? DEFAULT_ACCENT_COLOR;
  const accentForeground = getAccentForeground(accentColor);
  const visibleSections = siteConfig?.visible_sections ?? null;
  const isVisible = (key: string) => visibleSections == null || visibleSections[key] !== false;

  const availableRoomTypes = availabilityQuery.data?.room_types ?? [];

  // SaaS billing gate (mirrors the server check in holdRoomType): a hotel with
  // a lapsed subscription stops taking new bookings, but its page still renders
  // so guests who are already mid-stay / asking about an existing booking can
  // still find the contact details. `null` = billing not configured yet (pre-
  // migration), in which case the page behaves exactly as before.
  const billingBlock = (() => {
    const billing = availabilityQuery.data?.billing;
    if (!billing || billing.accepts_new_bookings) return null;
    return t(BILLING_REASON_KEYS[billing.reason] ?? BILLING_REASON_KEYS.default);
  })();

  const galleryPhotos = (() => {
    const slotBadges = [
      t("websiteBuilder.slot1Label"),
      t("websiteBuilder.slot2Label"),
      t("websiteBuilder.slot3Label"),
      t("websiteBuilder.slot4Label"),
      t("websiteBuilder.slot5Label"),
      t("websiteBuilder.slot6Label"),
    ];
    const items = [...(media ?? [])];
    return Array.from({ length: 6 }).map((_, idx) => {
      if (items[idx]) {
        return {
          id: items[idx].id,
          url: items[idx].url,
          caption: items[idx].caption || `${hotel.name} · ${t("publicHotel.photoNumber", { index: idx + 1 })}`,
          badge: slotBadges[idx] || `Photo ${idx + 1}`,
        };
      }
      const def = DEFAULT_ATMOSPHERE_PHOTOS[idx];
      return {
        id: def.id,
        url: def.url,
        caption: `${hotel.name} — ${t(def.captionKey as Parameters<typeof t>[0])}`,
        badge: slotBadges[idx],
      };
    });
  })();

  const scrollToBooking = () => {
    const bookElem = document.getElementById("book");
    if (bookElem) {
      bookElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleQuickBook = () => {
    scrollToBooking();
    if (wizardStep === 1 && isDatesValid) {
      setWizardStep(2);
    }
  };

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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div style={{ marginBottom: "20px", textAlign: "center", width: "100%" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "16px",
                  background: "#f7faf8",
                  border: "1px solid #dce4e0",
                  padding: "10px 22px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <small
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--public-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("publicHotel.quickBookingCheckIn")}
                  </small>
                  <strong style={{ fontSize: "15px", fontWeight: 700, color: "var(--public-text)" }}>
                    {checkIn ?? "—"}
                  </strong>
                </div>
                <ArrowRight size={16} style={{ color: accentColor }} aria-hidden="true" />
                <div style={{ textAlign: "left" }}>
                  <small
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--public-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("publicHotel.quickBookingCheckOut")}
                  </small>
                  <strong style={{ fontSize: "15px", fontWeight: 700, color: "var(--public-text)" }}>
                    {checkOut ?? "—"}
                  </strong>
                </div>
              </div>
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
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
            </div>
            <div style={{ width: "min(100%, 520px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
              <label style={{ color: "var(--public-text)", fontSize: 12, fontWeight: 600 }}>{t("publicHotel.adultsLabel")}
                <input aria-label={t("publicHotel.adultsLabel")} type="number" min="1" max="20" step="1" value={adults} onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} style={{ display: "block", width: "100%", marginTop: 5, padding: 10, borderRadius: 6, border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff" }} />
              </label>
              <label style={{ color: "var(--public-text)", fontSize: 12, fontWeight: 600 }}>{t("publicHotel.childrenLabel")}
                <select aria-label={t("publicHotel.childrenLabel")} value={children.length} disabled={!childRulesConfigured} onChange={event => setChildren(Array.from({ length: Number(event.target.value) }, (_, index) => children[index] ?? ""))} style={{ display: "block", width: "100%", marginTop: 5, padding: 10, borderRadius: 6, border: "1px solid #d0c9ba", color: "var(--ink)", background: childRulesConfigured ? "#fff" : "#e7e7e7" }}>
                  {Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              {!childRulesConfigured && <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: "var(--public-muted)" }}>{t("publicHotel.childRuleNotConfigured")}</p>}
              {children.map((value, index) => <label key={index} style={{ gridColumn: "1 / -1", color: "var(--public-text)", fontSize: 12, fontWeight: 600 }}>{t("publicHotel.childMeasurementLabel", { index: index + 1, measure: propertyChildRule === 'age' ? t("publicHotel.childAgeUnit") : t("publicHotel.childHeightUnit") })}
                <input type="number" min="0" max={propertyChildRule === 'age' ? 17 : 250} step={propertyChildRule === 'age' ? 1 : 0.5} value={value} onChange={event => setChildren(current => current.map((child, childIndex) => childIndex === index ? event.target.value : child))} style={{ display: "block", width: "100%", marginTop: 5, padding: 10, borderRadius: 6, border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff" }} />
              </label>)}
            </div>
            <div style={{ marginTop: "26px", width: "100%", display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="button public-button"
                disabled={!isDatesValid || !guestsValid}
                onClick={() => setWizardStep(2)}
                style={{
                  backgroundColor: accentColor,
                  borderColor: accentColor,
                  color: "#ffffff",
                  opacity: !isDatesValid ? 0.6 : 1,
                  cursor: !isDatesValid ? "not-allowed" : "pointer",
                  width: "min(100%, 360px)",
                  minHeight: "52px",
                  padding: "14px 32px",
                  fontSize: "16px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                <span>{t("publicHotel.wizardNext")}</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <div style={{ marginBottom: "18px" }}>
              {billingBlock ? (
                // Lapsed subscription: keep the room list visible for context but
                // close the booking action. The server rejects the hold anyway;
                // hiding it here just avoids a dead-end click.
                <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                  {billingBlock}
                </div>
              ) : availabilityQuery.isLoading ? (
                <div style={{ color: "#d2e8de", fontSize: "12px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
                  {t("publicHotel.checkingLiveRates")}
                </div>
              ) : availableRoomTypes.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {availableRoomTypes.map((rt) => {
                    const isPreferred = preferredRoomTypeId === rt.id;
                    const isAvailable = rt.is_available && !billingBlock;
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
            <h4 style={{ margin: "0 0 4px", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--public-text)", fontWeight: 700 }}>
              {t("publicHotel.guestInformation")}
            </h4>
            <div>
              <label style={{ display: "block", color: "var(--public-text)", fontSize: "11px", fontWeight: 600 }}>
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
                <label style={{ display: "block", color: "var(--public-text)", fontSize: "11px", fontWeight: 600 }}>
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
                <label style={{ display: "block", color: "var(--public-text)", fontSize: "11px", fontWeight: 600 }}>
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
              <label style={{ display: "block", color: "var(--public-text)", fontSize: "11px", fontWeight: 600 }}>
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
          <div style={{ background: "#f8faf9", padding: "20px", borderRadius: "10px", border: "1px solid #e1e8e4" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: "14px", color: "var(--public-text)", fontWeight: 700 }}>{t("publicHotel.summaryTitle")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", color: "var(--public-muted)", marginBottom: "16px" }}>
              <div><strong style={{ color: "var(--public-text)" }}>{t("publicHotel.summaryProperty")}</strong> {hotel.name}</div>
              <div><strong style={{ color: "var(--public-text)" }}>{t("publicHotel.summaryRoomType")}</strong> {heldBooking?.room_type_name} {heldBooking?.room_number ? `(${heldBooking.room_number})` : ""}</div>
              <div><strong style={{ color: "var(--public-text)" }}>{t("publicHotel.summaryCheckIn")}</strong> {checkIn}</div>
              <div><strong style={{ color: "var(--public-text)" }}>{t("publicHotel.summaryCheckOut")}</strong> {checkOut} ({heldBooking?.nights ?? 0} {t("publicHotel.confirmedNights", { count: heldBooking?.nights ?? 0 })})</div>
              <div><strong style={{ color: "var(--public-text)" }}>{t("publicHotel.summaryGuests")}</strong> {adults} {t("publicHotel.adultsLabel")} · {children.length} {t("publicHotel.childrenLabel")}</div>
            </div>
            {(servicesQuery.data ?? []).some((s) => (selectedServiceQty[s.id] ?? 0) > 0) && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "var(--public-text)", fontWeight: 600, marginBottom: "8px" }}>{t("publicHotel.summaryServices")}</div>
                <div style={{ display: "grid", gap: "6px" }}>
                  {(servicesQuery.data ?? [])
                    .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
                    .map((s) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--public-muted)" }}>
                        <span>{s.name} x {selectedServiceQty[s.id]}</span>
                        <strong style={{ color: "var(--public-text)" }}>฿{serviceLineTotal(s, selectedServiceQty[s.id]).toLocaleString()}</strong>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div style={{ borderTop: "1px solid #dce4df", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: "var(--public-text)" }}>
              <span>{t("publicHotel.summaryTotal")}</span>
              <span style={{ color: "var(--pine)" }}>฿{(confirmDetailsMutation.data?.amount ?? (heldBooking?.total_price ?? 0) + selectedServicesTotal).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(4)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="button"
                className="button public-button"
                onClick={() => setWizardStep(6)}
                style={{ backgroundColor: accentColor, borderColor: accentColor, color: accentForeground }}
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

  const primaryCta = isVisible("booking")
    ? { href: "#book", label: t("publicHotel.bookNow") }
    : isVisible("rooms")
      ? { href: "#stay", label: t("publicHotel.heroViewRooms") }
      : isVisible("location")
        ? { href: "#location", label: t("publicHotel.navLocation") }
        : isVisible("story")
          ? { href: "#story", label: t("publicHotel.storyEyebrow") }
          : null;

  return (
      <div className="public-page" style={{ "--public-accent": accentColor, "--public-accent-foreground": accentForeground } as React.CSSProperties}>
      <a className="public-skip-link" href="#public-main">{t("publicHotel.skipToContent")}</a>
      <header className="public-nav">
        <Link href={`/${hotel.slug}`} className="public-brand" aria-label={hotel.name}>
          <span className="public-brand-mark" aria-hidden="true">{hotel.name.slice(0, 1)}</span>
          <span>{hotel.name}</span>
        </Link>
        <nav id="public-navigation" className={menuOpen ? "is-open" : ""} aria-label={t("publicHotel.navigationAriaLabel")}>
          {isVisible("rooms") ? <a href="#stay" onClick={() => setMenuOpen(false)}>{t("publicHotel.navRooms")}</a> : null}
          {isVisible("location") ? <a href="#location" onClick={() => setMenuOpen(false)}>{t("publicHotel.navLocation")}</a> : null}
          {isVisible("booking") ? <a href="#book" className="public-nav-cta" onClick={() => setMenuOpen(false)}>{t("publicHotel.navCheckDates")} <ArrowRight size={14} aria-hidden="true" /></a> : null}
        </nav>
        <button className="public-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={t(menuOpen ? "publicHotel.menuCloseAria" : "publicHotel.menuToggleAria")} aria-expanded={menuOpen} aria-controls="public-navigation">{menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}</button>
      </header>
      <main id="public-main">
        {isVisible("hero") ? (
          <section className="public-hero" aria-labelledby="public-hotel-title">
            <div className="public-hero-content">
              <div className="eyebrow">{t("publicHotel.heroEyebrow")}</div>
              <h1 id="public-hotel-title">{hotel.name}</h1>
              <p>{heroCopy}</p>
              {primaryCta ? <a className="button public-button" href={primaryCta.href}>{primaryCta.label} <ArrowRight size={15} aria-hidden="true" /></a> : null}
            </div>
            <figure className="public-hero-media">
              {heroImage ? <img src={heroImage} alt={media.find(item => item.is_hero)?.caption ?? hotel.name} width={1600} height={1000} fetchPriority="high" /> : <div className="public-hero-image-fallback" aria-hidden="true" />}
              <figcaption className="public-hero-caption"><MapPin size={15} aria-hidden="true" /><span>{hotel.address}</span></figcaption>
            </figure>
          </section>
        ) : null}

        {/* 6-Photo Atmosphere & Room Gallery */}
        <section className="public-gallery" id="gallery" aria-labelledby="public-gallery-title">
          <div className="public-section-heading">
            <div>
              <div className="eyebrow">{t("publicHotel.galleryEyebrow")}</div>
              <h2 id="public-gallery-title">
                {t("publicHotel.galleryTitle")} <span>{t("publicHotel.galleryTitleHighlight")}</span>
              </h2>
            </div>
            <p>{t("publicHotel.galleryDesc")}</p>
          </div>
          <div className="public-gallery-grid">
            {galleryPhotos.map((item, idx) => (
              <div
                key={item.id}
                className={`public-gallery-item ${idx === 0 ? "slot-hero" : ""}`}
                onClick={() => setActiveLightboxIndex(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveLightboxIndex(idx); }}
                aria-label={t("publicHotel.galleryPhotoAria", { index: idx + 1 })}
              >
                <img
                  src={item.url}
                  alt={item.caption}
                  loading={idx === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
                <span className="public-gallery-badge">{item.badge}</span>
                <div className="public-gallery-overlay">
                  <span className="public-gallery-caption">{item.caption}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Big Centered Booking Calendar Section (ช่วงเดียว ปฏิทินใหญ่กลางๆ) */}
        {isVisible("booking") ? (
          <section className="public-booking" id="book" aria-labelledby="public-booking-title">
            <div className="public-booking-copy">
              <div className="eyebrow">{t("publicHotel.bookingEyebrow")}</div>
              <h2 id="public-booking-title">{t("publicHotel.bookingTitle")} <span>{t("publicHotel.bookingTitleHighlight")}</span></h2>
              <p>{t("publicHotel.bookingDesc")}</p>
            </div>

            <div className="public-booking-panel">
              <div className="public-wizard-progress">
                <span>{t("publicHotel.wizardStepOf", { step: wizardStep, total: 6 })}</span>
                <progress value={wizardStep} max={6} aria-label={t("publicHotel.wizardStepOf", { step: wizardStep, total: 6 })} />
              </div>

              {wizardError && (
                <div className="public-wizard-error" role="alert">
                  {wizardError}
                </div>
              )}

              {renderStepContent()}
            </div>
          </section>
        ) : null}

        {isVisible("rooms") ? <section className="public-rooms" id="stay" aria-labelledby="public-rooms-title">
          <div className="public-section-heading">
            <div>
              <div className="eyebrow">{t("publicHotel.roomsEyebrow")}</div>
              <h2 id="public-rooms-title">{t("publicHotel.roomsTitle")} <span>{t("publicHotel.roomsTitleHighlight")}</span></h2>
            </div>
            <p>{t("publicHotel.roomsDesc")}</p>
          </div>
          {roomTypes.length ? (
            <div className="public-room-grid">
              {roomTypes.map((room) => (
                <article className="public-room-card" key={room.id}>
                  <div className="public-room-image">
                    {roomPhotoFor(room.name)?.url ? (
                      <img src={roomPhotoFor(room.name)!.url} alt={room.name} width={720} height={480} loading="lazy" decoding="async" />
                    ) : (
                      <div className="public-room-image-fallback" role="img" aria-label={t("publicHotel.roomImagePlaceholder")}><BedDouble size={42} strokeWidth={1.4} aria-hidden="true" /></div>
                    )}
                  </div>
                  <div className="public-room-copy">
                    <div>
                      <h3>{room.name}</h3>
                      <span>{t("publicHotel.roomCapacityFrom", { capacity: room.capacity, price: Number(room.base_price).toLocaleString() })}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        className="public-room-book-cta"
                        type="button"
                        style={{ backgroundColor: accentColor, borderColor: accentColor }}
                        onClick={() => handleSelectRoom(room.id)}
                        aria-label={t("publicHotel.selectRoomAria", { room: room.name })}
                      >
                        <span>{t("publicHotel.bookThisRoom")}</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                      <button className="public-room-action" type="button" onClick={() => handleSelectRoom(room.id)} aria-label={t("publicHotel.selectRoomAria", { room: room.name })}>
                        <ArrowRight size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-empty-state">{t("publicHotel.noRoomsPublished")}</div>
          )}
        </section> : null}

        {isVisible("story") ? (
          <section className="public-intro" id="story">
            <div className="eyebrow">{t("publicHotel.storyEyebrow")}</div>
            <div>
              <h2>{t("publicHotel.storyStayAt")}<br /><i>{hotel.name}.</i></h2>
              <p>{t("publicHotel.storyDesc")}</p>
            </div>
          </section>
        ) : null}

        {isVisible("location") ? <section className="public-details" id="location" aria-labelledby="public-location-title">
          <div>
            <div className="eyebrow">{t("publicHotel.locationEyebrow")}</div>
            <h2 id="public-location-title">{t("publicHotel.locationTitle")} <span>{t("publicHotel.locationTitleHighlight")}</span></h2>
          </div>
          <div className="location-card">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <strong>{hotel.name}</strong>
              <address>{hotel.address}</address>
            </div>
          </div>
        </section> : null}
      </main>
      <footer className="public-footer">
        <div className="public-brand"><span className="public-brand-mark" aria-hidden="true">{hotel.name.slice(0, 1)}</span><span>{hotel.name}</span></div>
        <span>© {new Date().getFullYear()} {hotel.name}</span>
        <span>{t("publicHotel.footerManagedSecurely")}</span>
      </footer>

      {/* Lightbox Modal for 6-photo gallery */}
      {activeLightboxIndex !== null && (
        <div
          className="public-lightbox-backdrop"
          onClick={() => setActiveLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="public-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="public-lightbox-close"
              onClick={() => setActiveLightboxIndex(null)}
              aria-label={t("publicHotel.closePhotoAria")}
            >
              <X size={20} />
            </button>
            <button
              type="button"
              className="public-lightbox-nav public-lightbox-prev"
              onClick={() => setActiveLightboxIndex((activeLightboxIndex - 1 + 6) % 6)}
              aria-label={t("publicHotel.previousPhotoAria")}
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              className="public-lightbox-nav public-lightbox-next"
              onClick={() => setActiveLightboxIndex((activeLightboxIndex + 1) % 6)}
              aria-label={t("publicHotel.nextPhotoAria")}
            >
              <ChevronRight size={24} />
            </button>
            <div className="public-lightbox-image-wrap">
              <img
                src={galleryPhotos[activeLightboxIndex]?.url}
                alt={galleryPhotos[activeLightboxIndex]?.caption}
              />
            </div>
            <div className="public-lightbox-bar">
              <div>
                <strong style={{ fontSize: "14px", display: "block" }}>
                  {galleryPhotos[activeLightboxIndex]?.caption}
                </strong>
                <small style={{ color: "rgba(255,255,255,0.7)" }}>
                  {galleryPhotos[activeLightboxIndex]?.badge} · {activeLightboxIndex + 1} / 6
                </small>
              </div>
              <button
                type="button"
                className="public-quick-cta"
                style={{ backgroundColor: accentColor, borderColor: accentColor }}
                onClick={() => {
                  setActiveLightboxIndex(null);
                  handleQuickBook();
                }}
              >
                {t("publicHotel.quickBookingCta")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Booking Bar */}
      {isVisible("booking") ? <div className="public-sticky-booking" role="complementary" aria-label={t("publicHotel.stickyBookingAria")}>
        <div>
          <small style={{ display: "block", fontSize: "13px", color: "#475467" }}>
            {t("publicHotel.quickBookingInstant")}
          </small>
            <strong style={{ fontSize: "16px", fontWeight: 700, color: "var(--public-text)" }}>
            {roomTypes[0]
              ? t("publicHotel.mobileStickyFrom", { price: Number(roomTypes[0].base_price).toLocaleString() })
              : hotel.name}
          </strong>
        </div>
        <button
          type="button"
          className="public-room-book-cta"
          style={{ backgroundColor: accentColor, borderColor: accentColor, color: accentForeground }}
          onClick={scrollToBooking}
        >
          {t("publicHotel.mobileStickyBook")} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div> : null}
    </div>
  );
}
