import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n";
import BookingConfirmed from "./BookingConfirmed";

describe("BookingConfirmed payment result", () => {
  it("clearly reports that payment succeeded", () => {
    const markup = renderToStaticMarkup(
      <BookingConfirmed
        {...({
          t: (key: string, params?: Record<string, string | number>) => {
            const value = (en.publicHotel as Record<string, string>)[key.replace("publicHotel.", "")];
            return value ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
          },
          hotelName: "Sample Stay",
          guestName: "Guest",
          confirmedBookingId: "booking-12345678",
          heldBooking: { bookingId: "booking-12345678", roomTypeName: "Garden Room", roomNumber: null, nights: 1, totalPrice: 100 },
          checkIn: "2026-11-29",
          checkOut: "2026-11-30",
          confirmDetailsMutation: { data: { amount: 100 } },
          handleResetBooking: () => {},
        } as any)}
      />,
    );

    expect(markup).toContain("Payment successful");
    expect(markup).toContain("Sample Stay");
  });
});
