import { describe, expect, it } from "vitest";
import { formatBuddhistDate, getCalendarNightSelection, getMonthDates, isCheckoutDate, isDateSelected, selectCalendarDate } from "./oneCalendarRules";

describe("one calendar date rules", () => {
  it("lists every day of the month", () => {
    expect(getMonthDates(new Date(2026, 1, 1))).toHaveLength(28);
    expect(getMonthDates(new Date(2026, 0, 1))[0]).toBe("2026-01-01");
  });

  it("treats the second click as check-out and leaves that day unchanged", () => {
    expect(selectCalendarDate("2026-11-29", null, "2026-11-30")).toEqual(["2026-11-29", "2026-11-30"]);
    expect(getCalendarNightSelection("2026-11-29", "2026-11-30")).toEqual({ nights: ["2026-11-29"], lastNight: "2026-11-29", nightCount: 1 });
    expect(isDateSelected("2026-11-29", "2026-11-29", "2026-11-30")).toBe(true);
    expect(isDateSelected("2026-11-30", "2026-11-29", "2026-11-30")).toBe(false);
    expect(isCheckoutDate("2026-11-30", "2026-11-29", "2026-11-30")).toBe(true);
  });

  it("edits one night when the same date is clicked twice, including month end", () => {
    expect(selectCalendarDate("2026-11-30", null, "2026-11-30")).toEqual(["2026-11-30", "2026-11-30"]);
    expect(getCalendarNightSelection("2026-11-30", "2026-11-30")).toEqual({ nights: ["2026-11-30"], lastNight: "2026-11-30", nightCount: 1 });
    expect(isCheckoutDate("2026-11-30", "2026-11-30", "2026-11-30")).toBe(false);
  });

  it("crosses a month boundary and uses the night before check-out as the inclusive save end", () => {
    const [start, checkout] = selectCalendarDate("2026-10-29", null, "2026-11-02");
    expect(getCalendarNightSelection(start, checkout)).toEqual({ nights: ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"], lastNight: "2026-11-01", nightCount: 4 });
    expect(isDateSelected("2026-11-01", start, checkout)).toBe(true);
    expect(isDateSelected("2026-11-02", start, checkout)).toBe(false);
  });

  it("reverses earlier clicks and restarts after a completed range", () => {
    const range = selectCalendarDate("2026-12-02", null, "2026-11-29");
    expect(range).toEqual(["2026-11-29", "2026-12-02"]);
    expect(getCalendarNightSelection(...range).nightCount).toBe(3);
    expect(selectCalendarDate(...range, "2026-12-05")).toEqual(["2026-12-05", null]);
  });

  it("formats dates with a Buddhist year", () => {
    expect(formatBuddhistDate("2026-01-01")).toContain("2569");
  });
});
