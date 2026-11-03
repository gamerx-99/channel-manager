import React from "react";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export type BookingStepServicesProps = {
  t: Page["t"];
  remainingMs: Booking["remainingMs"];
  servicesQuery: Booking["servicesQuery"];
  selectedServiceQty: Booking["selectedServiceQty"];
  setSelectedServiceQty: Booking["setSelectedServiceQty"];
  serviceLineTotal: Booking["serviceLineTotal"];
  setWizardStep: Booking["setWizardStep"];
};

export default function BookingStepServices(props: BookingStepServicesProps) {
  const {
    t,
    remainingMs,
    servicesQuery,
    selectedServiceQty,
    setSelectedServiceQty,
    serviceLineTotal,
    setWizardStep,
  } = props;

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
}