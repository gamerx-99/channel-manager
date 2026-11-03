import React from "react";
import { PaymentQR } from "@/components/PaymentQR";
import { formatDateDDMMYYYY } from "@/lib/formatDate";
import { nightsLabel } from "@/lib/nightsLabel";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export type BookingStepPaymentProps = {
  mode: "summary" | "payment";
  t: Page["t"];
  hotelName: string;
  heldBooking: Booking["heldBooking"];
  checkIn: Booking["checkIn"];
  checkOut: Booking["checkOut"];
  adults: Booking["adults"];
  children: Booking["children"];
  servicesQuery: Booking["servicesQuery"];
  selectedServiceQty: Booking["selectedServiceQty"];
  serviceLineTotal: Booking["serviceLineTotal"];
  selectedServicesTotal: Booking["selectedServicesTotal"];
  confirmDetailsMutation: Booking["confirmDetailsMutation"];
  setWizardStep: Booking["setWizardStep"];
  setPaymentSuccess: Booking["setPaymentSuccess"];
  setWizardError: Booking["setWizardError"];
  handleResetBooking: Booking["handleResetBooking"];
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function BookingStepPayment(props: BookingStepPaymentProps) {
  const {
    mode,
    t,
    hotelName,
    heldBooking,
    checkIn,
    checkOut,
    adults,
    children,
    servicesQuery,
    selectedServiceQty,
    serviceLineTotal,
    selectedServicesTotal,
    confirmDetailsMutation,
    setWizardStep,
    setPaymentSuccess,
    setWizardError,
    handleResetBooking,
  } = props;

  if (mode === "summary") {
    return (
      <div className="booking-summary-card">
        <h4 className="booking-summary-title">{t("publicHotel.summaryTitle")}</h4>
        <div className="booking-summary-details">
          <div><strong>{t("publicHotel.summaryProperty")}</strong> {hotelName}</div>
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
  }

  return (
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
  );
}