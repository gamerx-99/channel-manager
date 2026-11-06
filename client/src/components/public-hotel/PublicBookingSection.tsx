import React from "react";
import type { usePublicHotelPage } from "./usePublicHotelPage";
import "./public-booking.css";
import BookingStepDates from "./BookingStepDates";
import BookingStepRooms from "./BookingStepRooms";
import BookingStepServices from "./BookingStepServices";
import BookingStepGuest from "./BookingStepGuest";
import BookingStepPayment from "./BookingStepPayment";
import BookingConfirmed from "./BookingConfirmed";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export default function PublicBookingSection({ page }: { page: Page }) {
  const { hotel, accentColor, accentTextColor, t, booking } = page;
  if (!booking) return null;
  const { wizardStep, setWizardStep, checkIn, setCheckIn, checkOut, setCheckOut, adults, setAdults, children, setChildren, preferredRoomTypeId, heldBooking, selectedServiceQty, setSelectedServiceQty, guestName, setGuestName, guestPhone, setGuestPhone, guestEmail, setGuestEmail, specialRequests, setSpecialRequests, confirmedBookingId, wizardError, setWizardError, paymentSuccess, setPaymentSuccess, remainingMs, isDatesValid, propertyChildRule, childRulesConfigured, childMeasurements, guestsValid, availabilityQuery, availableRoomTypes, holdRoomTypeMutation, servicesQuery, confirmDetailsMutation, handleResetBooking, handleHoldRoom, handleConfirmDetails, serviceLineTotal, selectedServicesTotal } = booking;
  const renderStepContent = () => {
    switch (wizardStep) {
      case 1:
        return (
          <BookingStepDates
            t={t}
            checkIn={checkIn}
            checkOut={checkOut}
            setCheckIn={setCheckIn}
            setCheckOut={setCheckOut}
            adults={adults}
            setAdults={setAdults}
            children={children}
            setChildren={setChildren}
            isDatesValid={isDatesValid}
            guestsValid={guestsValid}
            setWizardStep={setWizardStep}
            propertyChildRule={propertyChildRule}
            childRulesConfigured={childRulesConfigured}
            accentColor={accentColor}
          />
        );
      case 2:
        return (
          <BookingStepRooms
            t={t}
            availabilityQuery={availabilityQuery}
            availableRoomTypes={availableRoomTypes}
            preferredRoomTypeId={preferredRoomTypeId}
            handleHoldRoom={handleHoldRoom}
            holdRoomTypeMutation={holdRoomTypeMutation}
            setWizardStep={setWizardStep}
          />
        );
      case 3:
        return (
          <BookingStepServices
            t={t}
            remainingMs={remainingMs}
            servicesQuery={servicesQuery}
            selectedServiceQty={selectedServiceQty}
            setSelectedServiceQty={setSelectedServiceQty}
            serviceLineTotal={serviceLineTotal}
            setWizardStep={setWizardStep}
          />
        );
      case 4:
        return (
          <BookingStepGuest
            t={t}
            guestName={guestName}
            setGuestName={setGuestName}
            guestPhone={guestPhone}
            setGuestPhone={setGuestPhone}
            guestEmail={guestEmail}
            setGuestEmail={setGuestEmail}
            specialRequests={specialRequests}
            setSpecialRequests={setSpecialRequests}
            confirmDetailsMutation={confirmDetailsMutation}
            handleConfirmDetails={handleConfirmDetails}
            setWizardStep={setWizardStep}
          />
        );
      case 5:
        return (
          <BookingStepPayment
            mode="summary"
            t={t}
            hotelName={hotel.name}
            heldBooking={heldBooking}
            checkIn={checkIn}
            checkOut={checkOut}
            adults={adults}
            children={children}
            servicesQuery={servicesQuery}
            selectedServiceQty={selectedServiceQty}
            serviceLineTotal={serviceLineTotal}
            selectedServicesTotal={selectedServicesTotal}
            confirmDetailsMutation={confirmDetailsMutation}
            setWizardStep={setWizardStep}
            setPaymentSuccess={setPaymentSuccess}
            setWizardError={setWizardError}
            handleResetBooking={handleResetBooking}
          />
        );
      case 6:
        return paymentSuccess ? (
          <BookingConfirmed
            t={t}
            hotelName={hotel.name}
            guestName={guestName}
            confirmedBookingId={confirmedBookingId}
            heldBooking={heldBooking}
            checkIn={checkIn}
            checkOut={checkOut}
            confirmDetailsMutation={confirmDetailsMutation}
            handleResetBooking={handleResetBooking}
          />
        ) : (
          <BookingStepPayment
            mode="payment"
            t={t}
            hotelName={hotel.name}
            heldBooking={heldBooking}
            checkIn={checkIn}
            checkOut={checkOut}
            adults={adults}
            children={children}
            servicesQuery={servicesQuery}
            selectedServiceQty={selectedServiceQty}
            serviceLineTotal={serviceLineTotal}
            selectedServicesTotal={selectedServicesTotal}
            confirmDetailsMutation={confirmDetailsMutation}
            setWizardStep={setWizardStep}
            setPaymentSuccess={setPaymentSuccess}
            setWizardError={setWizardError}
            handleResetBooking={handleResetBooking}
          />
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