import { ArrowRight, CheckCircle2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PaymentQR } from "@/components/PaymentQR";
import { BookingDateRangePicker } from "@/components/BookingDateRangePicker";
import { useTranslation } from "@/lib/i18n";
import { calculateServiceTotal } from "@shared/pricingModels";

/**
 * The one public booking flow shared by every hotel theme (spec 16).
 * Owner-defined order: 1 dates + room (hold starts) → 2 add-ons → 3 guest info → 4 summary → 5 payment.
 * Colours and fonts come only from `--t-*` CSS variables; the fallbacks reproduce the default look.
 */
export const BOOKING_FLOW_TOTAL_STEPS = 5;

type FlowStep = 1 | 2 | 3 | 4 | 5;

type ServicePricingModel = "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME";

export type BookingFlowProps = {
  slug: string;
  hotelName: string;
  roomTypes: ReadonlyArray<{ child_rule?: string | null; child_rule_limit?: number | string | null }>;
  accentColor: string;
  preferredRoomTypeId?: string | null;
};

const v = (name: string, fallback: string) => `var(--t-${name}, ${fallback})`;
const tone = {
  text: v("flow-text", "#e8eee8"),
  muted: v("flow-muted", "#d2e8de"),
  heading: v("flow-heading", "#ffffff"),
  panelBg: v("flow-panel-bg", "rgba(255,255,255,0.06)"),
  panelBorder: v("flow-panel-border", "rgba(255,255,255,0.15)"),
  noteBg: v("flow-note-bg", "rgba(0,0,0,0.15)"),
  cardBg: v("card-bg", "rgba(255,255,255,0.92)"),
  cardText: v("card-text", "var(--ink)"),
  cardBorder: v("card-border", "#dfd8cb"),
  cardMuted: v("card-muted", "#6a7670"),
  price: v("price", "var(--pine)"),
  onPrimary: v("on-primary", "#ffffff"),
  radius: v("radius", "7px"),
  fontBody: v("font-body", "inherit"),
  fontHeading: v("font-heading", "inherit"),
};

const noteStyle: React.CSSProperties = { color: tone.muted, fontSize: "12px", padding: "12px", background: tone.noteBg, borderRadius: "6px" };
const labelStyle: React.CSSProperties = { display: "block", color: tone.text, fontSize: "11px", fontWeight: 600 };
const inputStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: "5px", padding: "10px", borderRadius: "6px", border: "1px solid #d0c9ba", color: "var(--ink)", background: "#fff", fontSize: "12px" };

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

/** Delay availability lookups while the guest is still typing (the procedure is rate-limited). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function BookingFlow({ slug, hotelName, roomTypes, accentColor, preferredRoomTypeId = null }: BookingFlowProps) {
  const { t } = useTranslation();
  const [wizardStep, setWizardStep] = useState<FlowStep>(1);
  const [checkIn, setCheckIn] = useState<string | null>(getTomorrowDateString());
  const [checkOut, setCheckOut] = useState<string | null>(getDayAfterTomorrowDateString());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState<string[]>([]);
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

  const isDatesValid = Boolean(checkIn && checkOut && checkOut > checkIn);
  const propertyChildRule = roomTypes[0]?.child_rule ?? "age";
  const childRulesConfigured = roomTypes.length > 0 && roomTypes.every(roomType => roomType.child_rule === "age" || roomType.child_rule_limit != null);
  const childMeasurements = children.filter(value => value !== "").map(value => propertyChildRule === "age" ? { age: Number(value) } : { height_cm: Number(value) });
  const guestsValid = adults >= 1 && children.every(value => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);

  const availabilityInput = useDebouncedValue(
    { slug, check_in: checkIn ?? "", check_out: checkOut ?? "", adults, children: childMeasurements },
    400,
  );
  const availabilityQuery = trpc.channelManager.publicHotelAvailability.useQuery(availabilityInput, {
    enabled: Boolean(slug && isDatesValid && guestsValid && wizardStep === 1),
    staleTime: 30_000,
  });

  const holdRoomTypeMutation = trpc.channelManager.holdRoomType.useMutation({
    onSuccess: (data) => {
      setHeldBooking(data);
      setWizardError(null);
      setWizardStep(2);
    },
    onError: (err) => setWizardError(err.message),
  });

  const servicesQuery = trpc.channelManager.listPublicHotelServices.useQuery(
    { slug },
    { enabled: wizardStep >= 2 },
  );

  const confirmDetailsMutation = trpc.channelManager.confirmBookingDetails.useMutation({
    onSuccess: (data) => {
      setConfirmedBookingId(data.booking_id);
      setWizardError(null);
      setWizardStep(4);
    },
    onError: (err) => setWizardError(err.message),
  });

  const handleResetBooking = () => {
    setWizardStep(1);
    setCheckIn(getTomorrowDateString());
    setCheckOut(getDayAfterTomorrowDateString());
    setAdults(2);
    setChildren([]);
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

  // Lazy-expiry countdown for the held/pending booking (steps 2-4; PaymentQR owns step 5's expiry).
  useEffect(() => {
    if (!heldBooking?.expires_at || wizardStep < 2 || wizardStep > 4) return;
    const tick = () => {
      const ms = new Date(heldBooking.expires_at).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) {
        handleResetBooking();
        setWizardError(t("publicHotel.holdExpiredRestart"));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [heldBooking?.expires_at, wizardStep, t]);

  const availableRoomTypes = availabilityQuery.data?.room_types ?? [];
  const services = servicesQuery.data ?? [];

  const handleHoldRoom = (roomTypeId: string) => {
    if (!checkIn || !checkOut || !isDatesValid || !guestsValid) return;
    setWizardError(null);
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

    // ASSUMPTION: the Supabase confirmBookingDetails schema still takes priced lines (no hotel_service_id
    // yet); switching to ids happens with the D1 router (13-04a). Logged in .agent/OPEN_QUESTIONS.md.
    const selectedServices = services
      .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
      .map((s) => ({
        service_name: s.name,
        pricing_model: s.pricing_model as ServicePricingModel,
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
      services: selectedServices,
    });
  };

  const serviceLineTotal = (service: { name: string; pricing_model: string; unit_price: number | string }, qty: number) =>
    calculateServiceTotal(
      {
        service_name: service.name,
        pricing_model: service.pricing_model as ServicePricingModel,
        unit_price: Number(service.unit_price),
        quantity: qty,
      },
      heldBooking?.nights ?? 0,
    );

  const serviceUnitLabel = (pricingModel: string) => {
    if (pricingModel === "PER_PERSON_PER_NIGHT") return t("publicHotel.serviceUnitPerPersonPerNight");
    if (pricingModel === "PER_NIGHT") return t("publicHotel.serviceUnitPerNight");
    return t("publicHotel.serviceUnitOnce");
  };

  const selectedServicesTotal = services.reduce(
    (sum, s) => sum + serviceLineTotal(s, selectedServiceQty[s.id] ?? 0),
    0,
  );

  const primaryButtonStyle = (disabled = false): React.CSSProperties => ({
    backgroundColor: accentColor,
    borderColor: accentColor,
    color: tone.onPrimary,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  const holdCountdown = (
    <p style={{ color: tone.muted, fontSize: "12px", marginBottom: "12px" }}>
      {t("publicHotel.holdExpiresIn", { time: formatCountdown(remainingMs) })}
    </p>
  );

  const renderStepContent = () => {
    switch (wizardStep) {
      case 1:
        return (
          <div data-booking-step="dates-room">
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
              <label style={{ color: tone.text, fontSize: 12, fontWeight: 600 }}>{t("publicHotel.adultsLabel")}
                <input aria-label={t("publicHotel.adultsLabel")} type="number" min="1" max="20" step="1" value={adults} onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} style={inputStyle} />
              </label>
              <label style={{ color: tone.text, fontSize: 12, fontWeight: 600 }}>{t("publicHotel.childrenLabel")}
                <select aria-label={t("publicHotel.childrenLabel")} value={children.length} disabled={!childRulesConfigured} onChange={event => setChildren(Array.from({ length: Number(event.target.value) }, (_, index) => children[index] ?? ""))} style={inputStyle}>
                  {Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              {!childRulesConfigured && <p style={{ gridColumn: "1 / -1", margin: 0, color: tone.muted }}>{t("publicHotel.childRuleNotConfigured")}</p>}
              {children.map((value, index) => <label key={index} style={{ gridColumn: "1 / -1", color: tone.text }}>{t("publicHotel.childMeasurementLabel", { index: index + 1, measure: propertyChildRule === "age" ? t("publicHotel.childAgeUnit") : t("publicHotel.childHeightUnit") })}
                <input type="number" min="0" max={propertyChildRule === "age" ? 17 : 250} step={propertyChildRule === "age" ? 1 : 0.5} value={value} onChange={event => setChildren(current => current.map((child, childIndex) => childIndex === index ? event.target.value : child))} style={inputStyle} />
              </label>)}
            </div>

            <h4 style={{ color: tone.heading, fontFamily: tone.fontHeading, fontSize: "14px", margin: "22px 0 10px" }}>{t("publicHotel.chooseRoomTitle")}</h4>
            {!isDatesValid || !guestsValid ? null : availabilityQuery.isLoading ? (
              <div style={noteStyle}>{t("publicHotel.checkingLiveRates")}</div>
            ) : availableRoomTypes.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {availableRoomTypes.map((rt) => {
                  const isPreferred = preferredRoomTypeId === rt.id;
                  const isAvailable = rt.is_available;
                  return (
                    <button
                      type="button"
                      key={rt.id}
                      disabled={!isAvailable || holdRoomTypeMutation.isPending}
                      onClick={() => handleHoldRoom(rt.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        font: "inherit",
                        padding: "12px 14px",
                        borderRadius: tone.radius,
                        background: tone.cardBg,
                        color: tone.cardText,
                        border: isPreferred ? `2px solid ${accentColor}` : `1px solid ${tone.cardBorder}`,
                        cursor: isAvailable ? "pointer" : "not-allowed",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: isAvailable ? 1 : 0.6,
                      }}
                    >
                      <span>
                        <strong style={{ fontSize: "13px", display: "block" }}>{rt.name}</strong>
                        <small style={{ color: tone.cardMuted, fontSize: "10px" }}>
                          {rt.rooms_available !== 1
                            ? t("publicHotel.roomsLeftPlural", { capacity: rt.capacity, count: rt.rooms_available })
                            : t("publicHotel.roomsLeft", { capacity: rt.capacity, count: rt.rooms_available })}
                          {rt.min_stay_violated ? t("publicHotel.minStayNote", { count: rt.min_stay_nights ?? 1 }) : ""}
                        </small>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: "14px", color: tone.price }}>
                          ฿{Number(rt.total_price).toLocaleString()}
                        </strong>
                        <small style={{ display: "block", color: tone.cardMuted, fontSize: "9px" }}>
                          {rt.nights > 1
                            ? t("publicHotel.nightPriceDetailPlural", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() })
                            : t("publicHotel.nightPriceDetail", { count: rt.nights, price: Number(rt.avg_nightly_price).toLocaleString() })}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div role="status" style={noteStyle}>{t("publicHotel.noRoomsFitGuests")}</div>
            )}
            {holdRoomTypeMutation.isPending ? (
              <div style={{ ...noteStyle, marginTop: "12px" }}>{t("publicHotel.holdingRoom")}</div>
            ) : (
              <p style={{ color: tone.muted, fontSize: "11px", margin: "12px 0 0" }}>{t("publicHotel.holdNote")}</p>
            )}
          </div>
        );

      case 2:
        return (
          <div data-booking-step="add-ons">
            {holdCountdown}
            <h4 style={{ color: tone.heading, fontFamily: tone.fontHeading, fontSize: "14px", margin: "0 0 12px" }}>{t("publicHotel.stepServicesTitle")}</h4>
            {servicesQuery.isLoading ? (
              <div style={{ ...noteStyle, marginBottom: "16px" }}>{t("publicHotel.checkingLiveRates")}</div>
            ) : services.length === 0 ? (
              <div style={{ ...noteStyle, marginBottom: "16px" }}>{t("publicHotel.noServicesAvailable")}</div>
            ) : (
              <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
                {services.map((s) => {
                  const qty = selectedServiceQty[s.id] ?? 0;
                  const checked = qty > 0;
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: tone.radius,
                        background: tone.cardBg,
                        color: tone.cardText,
                        border: `1px solid ${tone.cardBorder}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSelectedServiceQty((prev) => ({ ...prev, [s.id]: e.target.checked ? 1 : 0 }))}
                        />
                        <span>
                          <strong style={{ fontSize: "13px", display: "block" }}>{s.name}</strong>
                          <small style={{ color: tone.cardMuted, fontSize: "10px" }}>
                            ฿{Number(s.unit_price).toLocaleString()} {serviceUnitLabel(s.pricing_model)}
                          </small>
                        </span>
                      </label>
                      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "10px" }}>
                        {checked && (
                          <label style={{ fontSize: "11px", fontWeight: 600 }}>
                            {t("publicHotel.serviceQtyLabel")}
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => {
                                const next = Math.max(1, parseInt(e.target.value || "1", 10));
                                setSelectedServiceQty((prev) => ({ ...prev, [s.id]: next }));
                              }}
                              style={{ width: "60px", marginLeft: "6px", padding: "4px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "12px" }}
                            />
                          </label>
                        )}
                        <strong style={{ fontSize: "13px", color: tone.price, minWidth: "70px" }}>
                          ฿{serviceLineTotal(s, qty).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(1)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button type="button" className="button public-button" onClick={() => setWizardStep(3)} style={primaryButtonStyle()}>
                {services.length === 0 ? t("publicHotel.wizardSkip") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <form data-booking-step="guest-info" onSubmit={handleConfirmDetails} style={{ display: "grid", gap: "12px" }}>
            {holdCountdown}
            <h4 style={{ margin: "0 0 4px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: tone.text, fontFamily: tone.fontHeading }}>
              {t("publicHotel.guestInformation")}
            </h4>
            <div>
              <label style={labelStyle}>{t("publicHotel.fullName")}</label>
              <input
                type="text"
                placeholder={t("publicHotel.fullNamePlaceholder")}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle}>{t("publicHotel.phoneNumber")}</label>
                <input
                  type="tel"
                  placeholder={t("publicHotel.phonePlaceholder")}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("publicHotel.emailAddress")}</label>
                <input
                  type="email"
                  placeholder={t("publicHotel.emailPlaceholder")}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>{t("publicHotel.specialRequestsLabel")}</label>
              <textarea
                placeholder={t("publicHotel.specialRequestsPlaceholder")}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(2)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="submit"
                disabled={confirmDetailsMutation.isPending}
                className="button public-button"
                style={primaryButtonStyle(confirmDetailsMutation.isPending)}
              >
                {confirmDetailsMutation.isPending ? t("publicHotel.confirmingReservation") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </form>
        );

      case 4:
        return (
          <div data-booking-step="summary" style={{ background: tone.panelBg, padding: "20px", borderRadius: "10px", border: `1px solid ${tone.panelBorder}` }}>
            {holdCountdown}
            <h4 style={{ margin: "0 0 14px", fontSize: "14px", color: tone.heading, fontFamily: tone.fontHeading }}>{t("publicHotel.summaryTitle")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", fontSize: "12px", color: tone.text, marginBottom: "16px" }}>
              <div><strong>{t("publicHotel.summaryProperty")}</strong> {hotelName}</div>
              <div><strong>{t("publicHotel.summaryRoomType")}</strong> {heldBooking?.room_type_name} {heldBooking?.room_number ? `(${heldBooking.room_number})` : ""}</div>
              <div><strong>{t("publicHotel.summaryCheckIn")}</strong> {checkIn}</div>
              <div><strong>{t("publicHotel.summaryCheckOut")}</strong> {checkOut} ({(heldBooking?.nights ?? 0) > 1 ? t("publicHotel.confirmedNightsPlural", { count: heldBooking?.nights ?? 0 }) : t("publicHotel.confirmedNights", { count: heldBooking?.nights ?? 0 })})</div>
              <div><strong>{t("publicHotel.summaryGuests")}</strong> {t("publicHotel.adultsLabel")}: {adults}, {t("publicHotel.childrenLabel")}: {children.length}</div>
              <div><strong>{t("publicHotel.summaryGuestName")}</strong> {guestName.trim()}</div>
            </div>
            {services.some((s) => (selectedServiceQty[s.id] ?? 0) > 0) && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: tone.text, fontWeight: 600, marginBottom: "8px" }}>{t("publicHotel.summaryServices")}</div>
                <div style={{ display: "grid", gap: "6px" }}>
                  {services
                    .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
                    .map((s) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: tone.text }}>
                        <span>{s.name} x {selectedServiceQty[s.id]}</span>
                        <span>฿{serviceLineTotal(s, selectedServiceQty[s.id]).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div style={{ borderTop: `1px solid ${tone.panelBorder}`, paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: tone.heading }}>
              <span>{t("publicHotel.summaryTotal")}</span>
              <span>฿{(confirmDetailsMutation.data?.amount ?? (heldBooking?.total_price ?? 0) + selectedServicesTotal).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(3)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button type="button" className="button public-button" onClick={() => setWizardStep(5)} style={primaryButtonStyle()}>
                {t("publicHotel.confirmAndPay")}
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div data-booking-step="payment">
            {paymentSuccess ? (
              <div style={{ background: "#ffffff", color: "var(--ink)", padding: "28px", borderRadius: "10px", boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: tone.price, marginBottom: "14px" }}>
                  <CheckCircle2 size={28} />
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, fontFamily: tone.fontHeading }}>{t("publicHotel.bookingConfirmedTitle")}</h3>
                </div>
                <p style={{ margin: "0 0 18px", color: "#5a6660", fontSize: "13px" }}>
                  {t("publicHotel.bookingConfirmedNotice", { name: guestName.trim(), reference: (confirmedBookingId ?? heldBooking?.booking_id ?? "").slice(0, 8).toUpperCase() })}
                </p>
                <div style={{ background: "#f6f4ee", padding: "16px", borderRadius: "8px", fontSize: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                  <div><strong>{t("publicHotel.confirmedProperty")}</strong> {hotelName}</div>
                  <div><strong>{t("publicHotel.confirmedRoomType")}</strong> {heldBooking?.room_type_name} {heldBooking?.room_number ? `(${heldBooking.room_number})` : ""}</div>
                  <div><strong>{t("publicHotel.confirmedCheckIn")}</strong> {checkIn}</div>
                  <div><strong>{t("publicHotel.confirmedCheckOut")}</strong> {checkOut} ({(heldBooking?.nights ?? 0) > 1 ? t("publicHotel.confirmedNightsPlural", { count: heldBooking?.nights ?? 0 }) : t("publicHotel.confirmedNights", { count: heldBooking?.nights ?? 0 })})</div>
                  <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e2ddd0", paddingTop: "10px", fontSize: "14px", fontWeight: 700, color: tone.price }}>
                    {t("publicHotel.confirmedTotalStay", { amount: (confirmDetailsMutation.data?.amount ?? heldBooking?.total_price ?? 0).toLocaleString() })}
                  </div>
                </div>
                <button type="button" className="button public-button" onClick={handleResetBooking} style={{ ...primaryButtonStyle(), width: "100%" }}>
                  {t("publicHotel.bookAnotherStay")}
                </button>
              </div>
            ) : (
              heldBooking && (
                <PaymentQR
                  bookingId={heldBooking.booking_id}
                  hotelId={heldBooking.hotel_id}
                  onSuccess={() => setPaymentSuccess(true)}
                  onExpired={() => {
                    handleResetBooking();
                    setWizardError(t("publicHotel.holdExpiredRestart"));
                  }}
                />
              )
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ background: tone.panelBg, padding: "24px", borderRadius: "10px", border: `1px solid ${tone.panelBorder}`, fontFamily: tone.fontBody }}>
      <div style={{ color: tone.text, fontSize: "11px", fontWeight: 600, marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {t("publicHotel.wizardStepOf", { step: wizardStep, total: BOOKING_FLOW_TOTAL_STEPS })}
      </div>

      {wizardError && (
        <div role="alert" style={{ background: "#fee2e2", color: "#991b1b", padding: "12px 14px", borderRadius: "6px", fontSize: "12px", marginBottom: "16px" }}>
          {wizardError}
        </div>
      )}

      {renderStepContent()}
    </div>
  );
}
