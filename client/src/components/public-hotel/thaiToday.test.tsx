import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pickerProps = vi.hoisted(() => ({ current: null as null | { minDateIso: string } }));

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/components/BookingDateRangePicker", () => ({
  BookingDateRangePicker: (props: { minDateIso: string }) => {
    pickerProps.current = props;
    return null;
  },
}));

import BookingStepDates from "./BookingStepDates";
import {
  getDayAfterTomorrowDateString,
  getTodayDateString,
  getTomorrowDateString,
} from "./useBookingWizard";

// 2026-11-04T17:30:00Z is 00:30 on 5 Nov in Thailand (UTC+7); the UTC day is still 4 Nov.
const JUST_AFTER_THAI_MIDNIGHT = new Date("2026-11-04T17:30:00Z");

describe("public booking pages use today in Thailand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(JUST_AFTER_THAI_MIDNIGHT);
  });
  afterEach(() => {
    vi.useRealTimers();
    pickerProps.current = null;
  });

  it("offers 5 Nov, not yesterday, as the earliest selectable date", () => {
    renderToStaticMarkup(
      <BookingStepDates
        {...({
          t: (key: string) => key,
          checkIn: null,
          checkOut: null,
          setCheckIn: () => {},
          setCheckOut: () => {},
          adults: 2,
          setAdults: () => {},
          children: [],
          setChildren: () => {},
          isDatesValid: false,
          guestsValid: true,
          setWizardStep: () => {},
          propertyChildRule: "age",
          childRulesConfigured: true,
          accentColor: "#954831",
        } as any)}
      />,
    );
    expect(pickerProps.current?.minDateIso).toBe("2026-11-05");
  });

  it("summarizes selected check-in, check-out and nights and names the next action", () => {
    const markup = renderToStaticMarkup(
      <BookingStepDates
        {...({
          t: (key: string, params?: Record<string, string | number>) => key === "publicHotel.bookingNights" ? `${params?.count} nights` : key,
          checkIn: "2026-11-29",
          checkOut: "2026-11-30",
          setCheckIn: () => {},
          setCheckOut: () => {},
          adults: 2,
          setAdults: () => {},
          children: [],
          setChildren: () => {},
          isDatesValid: true,
          guestsValid: true,
          setWizardStep: () => {},
          propertyChildRule: "age",
          childRulesConfigured: true,
          accentColor: "#954831",
        } as any)}
      />,
    );

    expect(markup).toContain("publicHotel.bookingCheckIn");
    expect(markup).toContain("publicHotel.bookingCheckOut");
    expect(markup).toContain("1 nights");
    expect(markup).toContain("publicHotel.bookingViewAvailableRooms");
  });

  it("today is the Thai day", () => {
    expect(getTodayDateString()).toBe("2026-11-05");
  });

  it("default check-in and check-out are Thai tomorrow and the day after, never before today", () => {
    expect(getTomorrowDateString()).toBe("2026-11-06");
    expect(getDayAfterTomorrowDateString()).toBe("2026-11-07");
    expect(getTomorrowDateString() >= getTodayDateString()).toBe(true);
  });

  it("still rolls over correctly in the evening Thai time", () => {
    vi.setSystemTime(new Date("2026-11-05T16:59:00Z")); // 23:59 on 5 Nov in Thailand
    expect(getTodayDateString()).toBe("2026-11-05");
    vi.setSystemTime(new Date("2026-11-05T17:00:00Z")); // 00:00 on 6 Nov in Thailand
    expect(getTodayDateString()).toBe("2026-11-06");
  });
});
