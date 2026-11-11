import React from "react";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export type BookingStepGuestProps = {
  t: Page["t"];
  guestName: Booking["guestName"];
  setGuestName: Booking["setGuestName"];
  guestPhone: Booking["guestPhone"];
  setGuestPhone: Booking["setGuestPhone"];
  guestEmail: Booking["guestEmail"];
  setGuestEmail: Booking["setGuestEmail"];
  specialRequests: Booking["specialRequests"];
  setSpecialRequests: Booking["setSpecialRequests"];
  termsAccepted: Booking["termsAccepted"];
  setTermsAccepted: Booking["setTermsAccepted"];
  /** The hotel's own privacy notice for guests (the hotel is the data controller). */
  privacyHref: string;
  confirmDetailsMutation: Booking["confirmDetailsMutation"];
  handleConfirmDetails: Booking["handleConfirmDetails"];
  setWizardStep: Booking["setWizardStep"];
};

export default function BookingStepGuest(props: BookingStepGuestProps) {
  const {
    t,
    guestName,
    setGuestName,
    guestPhone,
    setGuestPhone,
    guestEmail,
    setGuestEmail,
    specialRequests,
    setSpecialRequests,
    termsAccepted,
    setTermsAccepted,
    privacyHref,
    confirmDetailsMutation,
    handleConfirmDetails,
    setWizardStep,
  } = props;
  const blocked = confirmDetailsMutation.isPending || !termsAccepted;

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
            required
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
      <div className="booking-consent">
        <input
          id="booking-consent"
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          required
          data-testid="booking-consent"
        />
        <label htmlFor="booking-consent">
          {t("guestConsent.before")}
          <a href="/terms" target="_blank" rel="noopener noreferrer">{t("guestConsent.terms")}</a>
          {t("guestConsent.between")}
          <a href={privacyHref} target="_blank" rel="noopener noreferrer">{t("guestConsent.privacy")}</a>
        </label>
      </div>
      <div className="booking-nav-row">
        <button type="button" className="button button-quiet" onClick={() => setWizardStep(3)}>
          {t("publicHotel.wizardBack")}
        </button>
        <button
          type="submit"
          disabled={blocked}
          className={`button public-button booking-action-button ${blocked ? "is-disabled" : ""}`.trim()}
        >
          {confirmDetailsMutation.isPending ? t("publicHotel.confirmingReservation") : t("publicHotel.wizardNext")}
        </button>
      </div>
    </form>
  );
}
