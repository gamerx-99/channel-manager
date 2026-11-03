import React from "react";
import { CheckCircle2 } from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/formatDate";
import { nightsLabel } from "@/lib/nightsLabel";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export type BookingConfirmedProps = {
  t: Page["t"];
  hotelName: string;
  guestName: Booking["guestName"];
  confirmedBookingId: Booking["confirmedBookingId"];
  heldBooking: Booking["heldBooking"];
  checkIn: Booking["checkIn"];
  checkOut: Booking["checkOut"];
  confirmDetailsMutation: Booking["confirmDetailsMutation"];
  handleResetBooking: Booking["handleResetBooking"];
};

export default function BookingConfirmed(props: BookingConfirmedProps) {
  const {
    t,
    hotelName,
    guestName,
    confirmedBookingId,
    heldBooking,
    checkIn,
    checkOut,
    confirmDetailsMutation,
    handleResetBooking,
  } = props;

  return (
    <div className="booking-confirmed-card">
      <div className="booking-confirmed-header">
        <CheckCircle2 size={28} />
        <h3 className="booking-confirmed-title">{t("publicHotel.bookingConfirmedTitle")}</h3>
      </div>
      <p className="booking-confirmed-notice">
        {t("publicHotel.bookingConfirmedNotice", { name: guestName.trim(), reference: (confirmedBookingId ?? heldBooking?.bookingId ?? "").slice(0, 8).toUpperCase() })}
      </p>
      <div className="booking-confirmed-details">
        <div><strong>{t("publicHotel.confirmedProperty")}</strong> {hotelName}</div>
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
  );
}