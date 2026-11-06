import React from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import HotelContactsList from "@/components/hotel/HotelContactsList";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

export type BookingReassuranceProps = {
  t: TFunction;
  hotelName: string;
  address?: string | null;
  // The public hotel query already leaves out every contact the hotel did not switch on,
  // so these are shown as they come.
  phone?: string | null;
  lineUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
};

export default function BookingReassurance({ t, hotelName, address, phone, lineUrl, facebookUrl, instagramUrl, xUrl }: BookingReassuranceProps) {
  const shownAddress = address?.trim();
  return (
    <section className="booking-reassurance" aria-label={t("publicBooking.contactsLabel")}>
      <ShieldCheck className="booking-reassurance-icon" size={22} aria-hidden="true" />
      <div className="booking-reassurance-body">
        <p className="booking-reassurance-title">{t("publicBooking.bookingWith", { name: hotelName })}</p>
        <p className="booking-reassurance-help">{t("publicBooking.contactDirect")}</p>
        {shownAddress ? (
          <p className="booking-reassurance-address">
            <MapPin size={14} aria-hidden="true" />
            <span>{shownAddress}</span>
          </p>
        ) : null}
        <HotelContactsList
          className="booking-reassurance-contacts"
          phone={phone}
          lineUrl={lineUrl}
          facebookUrl={facebookUrl}
          instagramUrl={instagramUrl}
          xUrl={xUrl}
        />
      </div>
    </section>
  );
}
