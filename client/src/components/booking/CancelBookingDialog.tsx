import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { CANCEL_REASON_MAX } from "./cancelBooking";
import { useCancelBooking } from "./useCancelBooking";
import "./CancelBookingDialog.css";

/** Owner decision 2026-11-11 (sheet 5.3): staff cancel a booking only with a reason. */
export default function CancelBookingDialog({ hotelId, booking, onClose }: {
  hotelId: string;
  booking: { id: string; guest_name: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { reason, setReason, valid, submit, cancelling, error } = useCancelBooking(hotelId, booking.id, onClose);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card cancel-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title" onMouseDown={event => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{t("cancelBooking.eyebrow")}</div>
            <h2 id="cancel-booking-title">{t("cancelBooking.title", { guest: booking.guest_name })}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("common.close")}><X size={17} /></button>
        </div>
        <p className="modal-lede">{t("cancelBooking.lede")}</p>
        <label className="cancel-booking-reason">
          {t("cancelBooking.reasonLabel")}
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={CANCEL_REASON_MAX} rows={3} required autoFocus />
          <small>{t("cancelBooking.reasonHint")}</small>
        </label>
        {error ? <p className="form-error" role="alert">{t(`cancelBooking.${error}`)}</p> : null}
        <div className="modal-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>{t("cancelBooking.back")}</button>
          <button className="button button-primary" type="submit" disabled={!valid || cancelling}>
            {cancelling ? t("cancelBooking.cancelling") : t("cancelBooking.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
