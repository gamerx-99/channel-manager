import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { PaymentQR } from "@/components/PaymentQR";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

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

  if (!bookingId || !hotelId) return <main className="public-page"><PageState tone="error" title={t("guestBooking.unavailableTitle")} description={t("guestBooking.unavailableDescription")} /></main>;
  if (query.isLoading) return <main className="public-page"><PageState tone="loading" title={t("guestBooking.loadingTitle")} description={t("guestBooking.loadingDescription")} /></main>;
  if (query.error || !query.data) return <main className="public-page"><PageState tone="error" title={t("guestBooking.unavailableTitle")} description={t("guestBooking.unavailableDescription")} actionLabel={t("guestBooking.backToHotel")} onAction={() => { window.location.href = "/"; }} /></main>;

  const booking = query.data;
  const canPay = !paymentCompleted && (booking.status === "pending_payment" || booking.status === "payment_rejected");
  const status = paymentCompleted ? t("guestBooking.confirmed")
    : booking.status === "pending_payment" ? t("guestBooking.awaitingPayment")
      : booking.status === "pending_verification" ? t("guestBooking.awaitingReview")
        : booking.status === "confirmed" ? t("guestBooking.confirmed")
          : booking.status.replaceAll("_", " ");

  return <main className="public-page">
    <section className="panel" style={{ maxWidth: 720, margin: "32px auto", padding: 24 }}>
      <div className="eyebrow">{t("guestBooking.eyebrow")}</div>
      <h1>{t("guestBooking.title")}</h1>
      <h2>{booking.hotel_name}</h2>
      <dl className="guest-booking-details">
        <dt>{t("guestBooking.reference")}</dt><dd>BK-{booking.booking_id.slice(0, 8).toUpperCase()}</dd>
        <dt>{t("guestBooking.guest")}</dt><dd>{booking.guest_name}</dd>
        <dt>{t("guestBooking.dates")}</dt><dd>{booking.check_in} – {booking.check_out}</dd>
        <dt>{t("guestBooking.roomType")}</dt><dd>{booking.room_type}</dd>
        <dt>{t("guestBooking.amount")}</dt><dd>฿{booking.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
        <dt>{t("guestBooking.status")}</dt><dd>{status}</dd>
      </dl>
      {canPay && <PaymentQR bookingId={booking.booking_id} hotelId={booking.hotel_id} onSuccess={() => { setPaymentCompleted(true); void utils.payment.getGuestBooking.invalidate({ booking_id: bookingId, hotel_id: hotelId }); }} onExpired={() => { void query.refetch(); }} />}
      {booking.status === "pending_verification" && <p role="status">{t("guestBooking.reviewNotice")}</p>}
      {(booking.status === "confirmed" || paymentCompleted) && <p role="status">{t("guestBooking.confirmedNotice")}</p>}
      <address>
        {booking.hotel_address}{booking.hotel_phone ? ` · ${booking.hotel_phone}` : ""}{booking.hotel_email ? ` · ${booking.hotel_email}` : ""}
      </address>
      <Link href={`/${encodeURIComponent(booking.hotel_slug)}`}>{t("guestBooking.backToHotel")}</Link>
    </section>
  </main>;
}
