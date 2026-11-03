import React from "react";
import { ArrowRight } from "lucide-react";
import { BookingDateRangePicker } from "@/components/BookingDateRangePicker";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export type BookingStepDatesProps = {
  t: Page["t"];
  checkIn: Booking["checkIn"];
  checkOut: Booking["checkOut"];
  setCheckIn: Booking["setCheckIn"];
  setCheckOut: Booking["setCheckOut"];
  adults: Booking["adults"];
  setAdults: Booking["setAdults"];
  children: Booking["children"];
  setChildren: Booking["setChildren"];
  isDatesValid: Booking["isDatesValid"];
  guestsValid: Booking["guestsValid"];
  setWizardStep: Booking["setWizardStep"];
  propertyChildRule: Booking["propertyChildRule"];
  childRulesConfigured: Booking["childRulesConfigured"];
  accentColor: string;
};

export default function BookingStepDates(props: BookingStepDatesProps) {
  const {
    t,
    checkIn,
    checkOut,
    setCheckIn,
    setCheckOut,
    adults,
    setAdults,
    children,
    setChildren,
    isDatesValid,
    guestsValid,
    setWizardStep,
    propertyChildRule,
    childRulesConfigured,
  } = props;

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
        accentColor={props.accentColor}
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
}