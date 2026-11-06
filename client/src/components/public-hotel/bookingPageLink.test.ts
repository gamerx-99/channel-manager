import { describe, expect, it } from "vitest";
import { bookingPageHref, parseBookingPrefill } from "./bookingPageLink";

const context = { today: "2026-11-06", roomTypeIds: ["room-garden", "room-loft"] };

describe("parseBookingPrefill", () => {
  it("fills room type and dates from a valid query", () => {
    expect(parseBookingPrefill("?roomType=room-loft&checkIn=2026-11-10&checkOut=2026-11-12", context)).toEqual({
      roomTypeId: "room-loft",
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
  });

  it("accepts check-in today in Thailand", () => {
    expect(parseBookingPrefill("checkIn=2026-11-06&checkOut=2026-11-07", context)).toEqual({
      roomTypeId: null,
      checkIn: "2026-11-06",
      checkOut: "2026-11-07",
    });
  });

  it("returns nothing for an empty query", () => {
    expect(parseBookingPrefill("", context)).toEqual({ roomTypeId: null, checkIn: null, checkOut: null });
  });

  it.each([
    ["2026-11-1", "2026-11-12"],
    ["2026/11/10", "2026-11-12"],
    ["2026-02-30", "2026-03-02"],
    ["2026-11-10", "tomorrow"],
    ["", "2026-11-12"],
    ["2026-11-10", ""],
  ])("drops both dates when one is badly written (%s → %s)", (checkIn, checkOut) => {
    const prefill = parseBookingPrefill(`?roomType=room-garden&checkIn=${checkIn}&checkOut=${checkOut}`, context);
    expect(prefill).toEqual({ roomTypeId: "room-garden", checkIn: null, checkOut: null });
  });

  it("drops the dates when check-out is not after check-in", () => {
    expect(parseBookingPrefill("checkIn=2026-11-12&checkOut=2026-11-10", context).checkIn).toBeNull();
    expect(parseBookingPrefill("checkIn=2026-11-12&checkOut=2026-11-12", context).checkOut).toBeNull();
  });

  it("drops the dates when check-in is already past in Thailand", () => {
    expect(parseBookingPrefill("checkIn=2026-11-05&checkOut=2026-11-08", context)).toEqual({
      roomTypeId: null,
      checkIn: null,
      checkOut: null,
    });
  });

  it("ignores a room type the hotel does not have", () => {
    expect(parseBookingPrefill("?roomType=room-penthouse&checkIn=2026-11-10&checkOut=2026-11-12", context)).toEqual({
      roomTypeId: null,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
  });
});

describe("bookingPageHref", () => {
  it("links to the booking page, with the room type when given", () => {
    expect(bookingPageHref("baan-suan")).toBe("/baan-suan/book");
    expect(bookingPageHref("baan-suan", "room 1&2")).toBe("/baan-suan/book?roomType=room%201%262");
    expect(bookingPageHref("baan-suan", null)).toBe("/baan-suan/book");
  });
});
