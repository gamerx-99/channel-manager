import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { PaymentQR } from "@/components/PaymentQR";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { formatDateDDMMYYYY } from "@/lib/formatDate";
import "./GuestBooking.css";

type StatusTone = "waiting" | "review" | "done" | "other";

export default function GuestBooking() {
  const [, params] = useRoute("/booking/:id");
  const bookingId = params?.id ?? "";
  const hotelId = useMemo(() => new URLSearchParams(window.location.search).get("hotel") ?? "", []);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const query = trpc.payment.getGuestBooking.useQuery(
    { booking_id: bookingId, hotel_id: hotelId },
    { enabled: Boolean(bookingId && hotelId) },
  );

  if (!bookingId || !hotelId) return <main className="public-page guest-booking-page"><PageState tone="error" title={t("guestBooking.unavailableTitle")} description={t("guestBooking.unavailableDescription")} /></main>;
  if (query.isLoading) return <main className="public-page guest-booking-page"><PageState tone="loading" title={t("guestBooking.loadingTitle")} description={t("guestBooking.loadingDescription")} /></main>;
  if (query.error || !query.data) return <main className="public-page guest-booking-page"><PageState tone="error" title={t("guestBooking.unavailableTitle")} description={t("guestBooking.unavailableDescription")} actionLabel={t("guestBooking.backToHotel")} onAction={() => { window.location.href = "/"; }} /></main>;

  const booking = query.data;
  const canPay = !paymentCompleted && (booking.status === "pending_payment" || booking.status === "payment_rejected");
  const confirmed = paymentCompleted || booking.status === "confirmed";
  const [status, tone]: [string, StatusTone] = confirmed ? [t("guestBooking.confirmed"), "done"]
    : booking.status === "pending_payment" ? [t("guestBooking.awaitingPayment"), "waiting"]
      : booking.status === "pending_verification" ? [t("guestBooking.awaitingReview"), "review"]
        : [booking.status.replaceAll("_", " "), "other"];
  const amount = `฿${booking.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <main className="public-page guest-booking-page">
    <section className="guest-booking-card">
      <header className="guest-booking-head">
        <div>
          <div className="eyebrow">{t("guestBooking.eyebrow")}</div>
          <h1>{booking.hotel_name}</h1>
          <p className="guest-booking-ref">{t("guestBooking.reference")} <strong>BK-{booking.booking_id.slice(0, 8).toUpperCase()}</strong></p>
        </div>
        <span className={`guest-booking-status guest-booking-status--${tone}`}>{status}</span>
      </header>

      <dl className="guest-booking-details">
        <div><dt>{t("guestBooking.guest")}</dt><dd>{booking.guest_name}</dd></div>
        <div><dt>{t("guestBooking.dates")}</dt><dd>{formatDateDDMMYYYY(booking.check_in)} – {formatDateDDMMYYYY(booking.check_out)}</dd></div>
        <div><dt>{t("guestBooking.roomType")}</dt><dd>{booking.room_type}</dd></div>
        <div><dt>{t("guestBooking.amount")}</dt><dd className="guest-booking-amount">{amount}</dd></div>
      </dl>

      {canPay && <div className="guest-booking-pay">
        <PaymentQR bookingId={booking.booking_id} hotelId={booking.hotel_id} onSuccess={() => { setPaymentCompleted(true); void utils.payment.getGuestBooking.invalidate({ booking_id: bookingId, hotel_id: hotelId }); }} onExpired={() => { void query.refetch(); }} />
      </div>}
      {!confirmed && booking.status === "pending_verification" && <p className="guest-booking-notice guest-booking-notice--review" role="status">{t("guestBooking.reviewNotice")}</p>}
      {confirmed && <p className="guest-booking-notice guest-booking-notice--done" role="status">{t("guestBooking.confirmedNotice")}</p>}

      <footer className="guest-booking-foot">
        <address>
          {booking.hotel_address}{booking.hotel_phone ? ` · ${booking.hotel_phone}` : ""}{booking.hotel_email ? ` · ${booking.hotel_email}` : ""}
        </address>
        <Link className="guest-booking-back" href={`/${encodeURIComponent(booking.hotel_slug)}`}>{t("guestBooking.backToHotel")}</Link>
      </footer>
    </section>
  </main>;
}
