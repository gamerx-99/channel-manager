import { ArrowRight, CheckCircle2 } from "lucide-react";
import React from "react";
import { formatDateDDMMYYYY } from "@/lib/formatDate";
import { PaymentQR } from "@/components/PaymentQR";
import { BookingDateRangePicker } from "@/components/BookingDateRangePicker";
import { nightsLabel } from "@/lib/nightsLabel";
import type { usePublicHotelPage } from "./usePublicHotelPage";
import { getContrastText } from "@/lib/contrastText";
import "./public-booking.css";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function PublicBookingSection({ page }: { page: Page }) {
  const { hotel, accentColor, t, booking } = page;
  const accentTextColor = getContrastText(accentColor);
  if (!booking) return null;
  const { wizardStep, setWizardStep, checkIn, setCheckIn, checkOut, setCheckOut, adults, setAdults, children, setChildren, preferredRoomTypeId, heldBooking, selectedServiceQty, setSelectedServiceQty, guestName, setGuestName, guestPhone, setGuestPhone, guestEmail, setGuestEmail, specialRequests, setSpecialRequests, confirmedBookingId, wizardError, setWizardError, paymentSuccess, setPaymentSuccess, remainingMs, isDatesValid, propertyChildRule, childRulesConfigured, childMeasurements, guestsValid, availabilityQuery, availableRoomTypes, holdRoomTypeMutation, servicesQuery, confirmDetailsMutation, handleResetBooking, handleHoldRoom, handleConfirmDetails, serviceLineTotal, selectedServicesTotal } = booking;
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
            <div className="booking-guests">
              <label className="booking-guest-label">{t("publicHotel.adultsLabel")}
                <input aria-label={t("publicHotel.adultsLabel")} type="number" min="1" max="20" step="1" value={adults} onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} />
              </label>
              <label className="booking-guest-label">{t("publicHotel.childrenLabel")}
                <select aria-label={t("publicHotel.childrenLabel")} value={children.length} disabled={!childRulesConfigured} onChange={event => setChildren(Array.from({ length: Number(event.target.value) }, (_, index) => children[index] ?? ""))}>
                  {Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              {!childRulesConfigured && <p className="booking-child-rule-note">{t("publicHotel.childRuleNotConfigured")}</p>}
              {children.map((value, index) => <label key={index} className="booking-child-measurement-label">{t("publicHotel.childMeasurementLabel", { index: index + 1, measure: propertyChildRule === 'age' ? t("publicHotel.childAgeUnit") : t("publicHotel.childHeightUnit") })}
                <input type="number" min="0" max={propertyChildRule === 'age' ? 17 : 250} step={propertyChildRule === 'age' ? 1 : 0.5} value={value} onChange={event => setChildren(current => current.map((child, childIndex) => childIndex === index ? event.target.value : child))} />
              </label>)}
            </div>
            <div className="booking-next-row">
              <button
                type="button"
                className={`button public-button booking-next booking-action-button ${!isDatesValid || !guestsValid ? "is-disabled" : ""}`.trim()}
                disabled={!isDatesValid || !guestsValid}
                onClick={() => setWizardStep(2)}
              >
                {t("publicHotel.wizardNext")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <div className="booking-room-list-container">
              {availabilityQuery.isLoading ? (
                <div className="booking-status-notice">
                  {t("publicHotel.checkingLiveRates")}
                </div>
              ) : availableRoomTypes.length > 0 ? (
                <div className="booking-room-grid">
                  {availableRoomTypes.map((rt: any) => {
                    const isPreferred = preferredRoomTypeId === rt.id;
                    const isAvailable = rt.is_available;
                    return (
                      <div
                        key={rt.id}
                        onClick={() => isAvailable && handleHoldRoom(rt.id)}
                        className={`booking-room-card ${isPreferred ? "is-preferred" : ""} ${!isAvailable ? "is-disabled" : ""}`.trim()}
                      >
                        <div>
                          <strong className="booking-item-title">{rt.name}</strong>
                          <small className="booking-room-subtitle">
                            {rt.rooms_available !== 1
                              ? t("publicHotel.roomsLeftPlural", { capacity: rt.capacity, count: rt.rooms_available })
                              : t("publicHotel.roomsLeft", { capacity: rt.capacity, count: rt.rooms_available })}
                            {rt.min_stay_violated ? t("publicHotel.minStayNote", { count: rt.min_stay_nights ?? 1 }) : ""}
                          </small>
                        </div>
                        <div className="booking-room-price-col">
                          <strong className="booking-room-price">
                            ฿{Number(rt.total_price).toLocaleString()}
                          </strong>
                          <small className="booking-room-price-sub">
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
                <div role="status" className="booking-status-notice">
                  {t("publicHotel.noRoomsFitGuests")}
                </div>
              )}
            </div>
            {holdRoomTypeMutation.isPending && (
              <div className="booking-status-notice booking-status-notice-spaced">
                {t("publicHotel.holdingRoom")}
              </div>
            )}
            <div className="booking-nav-row">
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(1)}>
                {t("publicHotel.wizardBack")}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <p className="booking-hold-timer">
              {t("publicHotel.holdExpiresIn", { time: formatCountdown(remainingMs) })}
            </p>
            <h4 className="booking-section-subheading">{t("publicHotel.stepServicesTitle")}</h4>
            {servicesQuery.isLoading ? (
              <div className="booking-status-notice booking-status-notice-spaced">
                {t("publicHotel.checkingLiveRates")}
              </div>
            ) : (servicesQuery.data ?? []).length === 0 ? (
              <div className="booking-status-notice booking-status-notice-spaced">
                {t("publicHotel.noServicesAvailable")}
              </div>
            ) : (
              <div className="booking-services-grid">
                {(servicesQuery.data ?? []).map((s) => {
                  const qty = selectedServiceQty[s.id] ?? 0;
                  const checked = qty > 0;
                  return (
                    <div
                      key={s.id}
                      className="booking-service-card"
                    >
                      <div className="booking-service-info">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedServiceQty((prev) => ({
                              ...prev,
                              [s.id]: e.target.checked ? 1 : 0,
                            }));
                          }}
                          className="booking-service-checkbox"
                        />
                        <div>
                          <strong className="booking-item-title">{s.name}</strong>
                          <small className="booking-item-subtitle">{s.pricingModel}</small>
                        </div>
                      </div>
                      <div className="booking-service-actions">
                        {checked && (
                          <label className="booking-service-qty-label">
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
                              className="booking-service-qty-input"
                            />
                          </label>
                        )}
                        <strong className="booking-service-total">
                          ฿{serviceLineTotal(s, qty).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="booking-nav-row">
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(2)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button type="button" className="button public-button booking-action-button" onClick={() => setWizardStep(4)}>
                {(servicesQuery.data ?? []).length === 0 ? t("publicHotel.wizardSkip") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <form onSubmit={handleConfirmDetails} className="booking-form-grid">
            <h4 className="booking-form-heading">
              {t("publicHotel.guestInformation")}
            </h4>
            <div>
              <label className="booking-form-label">
                {t("publicHotel.fullName")}
              </label>
              <input
                type="text"
                placeholder={t("publicHotel.fullNamePlaceholder")}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                className="booking-form-input"
              />
            </div>
            <div className="booking-form-two-col">
              <div>
                <label className="booking-form-label">
                  {t("publicHotel.phoneNumber")}
                </label>
                <input
                  type="tel"
                  placeholder={t("publicHotel.phonePlaceholder")}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="booking-form-input"
                />
              </div>
              <div>
                <label className="booking-form-label">
                  {t("publicHotel.emailAddress")}
                </label>
                <input
                  type="email"
                  placeholder={t("publicHotel.emailPlaceholder")}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="booking-form-input"
                />
              </div>
            </div>
            <div>
              <label className="booking-form-label">
                {t("publicHotel.specialRequestsLabel")}
              </label>
              <textarea
                placeholder={t("publicHotel.specialRequestsPlaceholder")}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={3}
                className="booking-form-textarea"
              />
            </div>
            <div className="booking-nav-row">
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(3)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="submit"
                disabled={confirmDetailsMutation.isPending}
                className={`button public-button booking-action-button ${confirmDetailsMutation.isPending ? "is-disabled" : ""}`.trim()}
              >
                {confirmDetailsMutation.isPending ? t("publicHotel.confirmingReservation") : t("publicHotel.wizardNext")}
              </button>
            </div>
          </form>
        );

      case 5:
        return (
          <div className="booking-summary-card">
            <h4 className="booking-summary-title">{t("publicHotel.summaryTitle")}</h4>
            <div className="booking-summary-details">
              <div><strong>{t("publicHotel.summaryProperty")}</strong> {hotel.name}</div>
              <div><strong>{t("publicHotel.summaryRoomType")}</strong> {heldBooking?.roomTypeName} {heldBooking?.roomNumber ? `(${heldBooking.roomNumber})` : ""}</div>
              <div><strong>{t("publicHotel.summaryCheckIn")}</strong> {checkIn ? formatDateDDMMYYYY(checkIn) : ""}</div>
              <div><strong>{t("publicHotel.summaryCheckOut")}</strong> {checkOut ? formatDateDDMMYYYY(checkOut) : ""} ({nightsLabel(t, heldBooking?.nights ?? 0)})</div>
              <div><strong>{t("publicHotel.summaryGuests")}</strong> {t("publicHotel.adultsLabel")}: {adults}, {t("publicHotel.childrenLabel")}: {children.length}</div>
            </div>
            {(servicesQuery.data ?? []).some((s) => (selectedServiceQty[s.id] ?? 0) > 0) && (
              <div className="booking-summary-services-wrap">
                <div className="booking-summary-services-heading">{t("publicHotel.summaryServices")}</div>
                <div className="booking-summary-services-list">
                  {(servicesQuery.data ?? [])
                    .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
                    .map((s) => (
                      <div key={s.id} className="booking-summary-service-row">
                        <span>{s.name} x {selectedServiceQty[s.id]}</span>
                        <span>฿{serviceLineTotal(s, selectedServiceQty[s.id]).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="booking-summary-total-row">
              <span>{t("publicHotel.summaryTotal")}</span>
              <span>฿{(confirmDetailsMutation.data?.amount ?? (Number(heldBooking?.totalPrice ?? 0) + selectedServicesTotal)).toLocaleString()}</span>
            </div>
            <div className="booking-nav-row booking-nav-row-lg">
              <button type="button" className="button button-quiet" onClick={() => setWizardStep(4)}>
                {t("publicHotel.wizardBack")}
              </button>
              <button
                type="button"
                className="button public-button booking-action-button"
                onClick={() => setWizardStep(6)}
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
              <div className="booking-confirmed-card">
                <div className="booking-confirmed-header">
                  <CheckCircle2 size={28} />
                  <h3 className="booking-confirmed-title">{t("publicHotel.bookingConfirmedTitle")}</h3>
                </div>
                <p className="booking-confirmed-notice">
                  {t("publicHotel.bookingConfirmedNotice", { name: guestName.trim(), reference: (confirmedBookingId ?? heldBooking?.bookingId ?? "").slice(0, 8).toUpperCase() })}
                </p>
                <div className="booking-confirmed-details">
                  <div><strong>{t("publicHotel.confirmedProperty")}</strong> {hotel.name}</div>
                  <div><strong>{t("publicHotel.confirmedRoomType")}</strong> {heldBooking?.roomTypeName} {heldBooking?.roomNumber ? `(${heldBooking.roomNumber})` : ""}</div>
                  <div><strong>{t("publicHotel.confirmedCheckIn")}</strong> {checkIn ? formatDateDDMMYYYY(checkIn) : ""}</div>
                  <div><strong>{t("publicHotel.confirmedCheckOut")}</strong> {checkOut ? formatDateDDMMYYYY(checkOut) : ""} ({nightsLabel(t, heldBooking?.nights ?? 0)})</div>
                  <div className="booking-confirmed-total-row">
                    {t("publicHotel.confirmedTotalStay", { amount: (confirmDetailsMutation.data?.amount ?? Number(heldBooking?.totalPrice ?? 0)).toLocaleString() })}
                  </div>
                </div>
                <button
                  type="button"
                  className="button public-button booking-action-button booking-action-button-full"
                  onClick={handleResetBooking}
                >
                  {t("publicHotel.bookAnotherStay")}
                </button>
              </div>
            ) : (
              <div>
                {heldBooking && (
                  <PaymentQR
                    bookingId={heldBooking.bookingId}
                    hotelId={heldBooking.hotelId}
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
    <section
      className="public-booking"
      id="book"
      style={{
        "--booking-accent": accentColor,
        "--booking-accent-contrast": accentTextColor,
      } as React.CSSProperties}
    >
      <div>
        <div className="eyebrow">{t("publicHotel.bookingEyebrow")}</div>
        <h2>{t("publicHotel.bookingTitle")}<br /><i>{t("publicHotel.bookingTitleHighlight")}</i></h2>
        <p>{t("publicHotel.bookingDesc")}</p>
      </div>
      <div className="booking-box">
        <div className="booking-step-indicator">{t("publicHotel.wizardStepOf", { step: wizardStep, total: 6 })}</div>
        {wizardError && <div className="booking-error-banner">{wizardError}</div>}
        {renderStepContent()}
      </div>
    </section>
  );
}
