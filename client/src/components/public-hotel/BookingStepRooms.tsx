import React from "react";
import type { usePublicHotelPage } from "./usePublicHotelPage";
import { trpc } from "@/lib/trpc";
import type { RoomTypeDetails } from "@shared/roomTypeDetails";
import {
  type RoomAmenityKey,
  normalizeAmenities,
} from "@shared/roomAmenities";
import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Fan,
  Wifi,
  Tv,
  Refrigerator,
  Flame,
  ShowerHead,
  Sun,
  Mountain,
  Coffee,
  Shirt,
  LampDesk,
  Vault,
  UtensilsCrossed,
  Microwave,
  BugOff,
  Bath,
  Wind,
  Layers,
  Sparkles,
  Waves,
  Umbrella,
  WashingMachine,
  Beef,
  CigaretteOff,
  BedSingle,
  Building,
  ArrowUpDown,
  Accessibility,
  Hand,
} from "lucide-react";

export const AMENITY_ICONS: Record<RoomAmenityKey, LucideIcon> = {
  // popular
  air_conditioning: AirVent,
  fan: Fan,
  free_wifi: Wifi,
  tv: Tv,
  refrigerator: Refrigerator,
  hot_water: Flame,
  private_bathroom: ShowerHead,
  balcony: Sun,
  view: Mountain,
  // in_room
  kettle: Coffee,
  wardrobe: Shirt,
  desk: LampDesk,
  safe: Vault,
  kitchenette: UtensilsCrossed,
  microwave: Microwave,
  mosquito_net: BugOff,
  // bathroom
  bathtub: Bath,
  hair_dryer: Wind,
  towels: Layers,
  toiletries: Sparkles,
  // outdoor
  private_pool: Waves,
  terrace: Umbrella,
  washing_machine: WashingMachine,
  bbq: Beef,
  non_smoking: CigaretteOff,
  extra_bed: BedSingle,
  // access
  ground_floor: Building,
  elevator: ArrowUpDown,
  wheelchair_accessible: Accessibility,
  grab_rails: Hand,
};

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

interface BookingRoomCardProps {
  rt: any;
  details?: Partial<RoomTypeDetails>;
  isPreferred: boolean;
  handleHoldRoom: (id: string) => void;
  t: Page["t"];
}

function BookingRoomCard({
  rt,
  details,
  isPreferred,
  handleHoldRoom,
  t,
}: BookingRoomCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isAvailable = rt.is_available;
  const amenities = normalizeAmenities(details?.amenities);
  const hasAmenities = amenities.length > 0;
  const hasMore = amenities.length > 6;
  const visibleAmenities = isExpanded ? amenities : amenities.slice(0, 6);

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
        {details?.description && <p>{details.description}</p>}
        {details?.bed_type && <small>{t("publicHotel.roomBedDetail", { value: details.bed_type })}</small>}
        {details?.size_sqm && <small>{t("publicHotel.roomSizeDetail", { value: details.size_sqm })}</small>}
        {hasAmenities && (
          <div className="booking-room-amenities-wrap">
            <ul className="booking-room-amenities">
              {visibleAmenities.map(amenityKey => {
                const Icon = AMENITY_ICONS[amenityKey];
                return (
                  <li key={amenityKey} className="booking-room-amenity-item">
                    {Icon && <Icon className="booking-room-amenity-icon" size={14} aria-hidden="true" />}
                    <span>{t(`roomAmenities.items.${amenityKey}`)}</span>
                  </li>
                );
              })}
            </ul>
            {hasMore && !isExpanded && (
              <button
                type="button"
                className="booking-amenities-expander"
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
              >
                {t("roomAmenities.moreItems", { count: amenities.length - 6 })}
              </button>
            )}
          </div>
        )}
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
}

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
  const slug = availabilityQuery.data?.hotel.slug ?? "";
  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug, { enabled: Boolean(slug) });
  const detailsById = new Map(publicHotel.data?.roomTypes.map(roomType => [roomType.id, roomType]) ?? []);

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
              const details = detailsById.get(rt.id) as Partial<RoomTypeDetails> | undefined;
              return (
                <BookingRoomCard
                  key={rt.id}
                  rt={rt}
                  details={details}
                  isPreferred={isPreferred}
                  handleHoldRoom={handleHoldRoom}
                  t={t}
                />
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

