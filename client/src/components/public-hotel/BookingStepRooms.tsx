import React from "react";
import type { usePublicHotelPage } from "./usePublicHotelPage";

type Page = ReturnType<typeof usePublicHotelPage>;
type Booking = NonNullable<Page["booking"]>;

export type BookingStepRoomsProps = {
  t: Page["t"];
  availabilityQuery: Booking["availabilityQuery"];
  availableRoomTypes: Booking["availableRoomTypes"];
  preferredRoomTypeId: Booking["preferredRoomTypeId"];
  handleHoldRoom: Booking["handleHoldRoom"];
  holdRoomTypeMutation: Booking["holdRoomTypeMutation"];
  setWizardStep: Booking["setWizardStep"];
};

export default function BookingStepRooms(props: BookingStepRoomsProps) {
  const {
    t,
    availabilityQuery,
    availableRoomTypes,
    preferredRoomTypeId,
    handleHoldRoom,
    holdRoomTypeMutation,
    setWizardStep,
  } = props;

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
}