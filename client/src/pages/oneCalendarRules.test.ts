import { describe, expect, it } from "vitest";
import { formatBuddhistDate, getMonthDates, isDateSelected, selectCalendarDate } from "./oneCalendarRules";

describe("one calendar date rules", () => {
  it("lists every day of the month", () => {
    expect(getMonthDates(new Date(2026, 1, 1))).toHaveLength(28);
    expect(getMonthDates(new Date(2026, 0, 1))[0]).toBe("2026-01-01");
  });

  it("selects an inclusive range in either click order", () => {
    expect(selectCalendarDate("2026-01-10", null, "2026-01-12")).toEqual(["2026-01-10", "2026-01-12"]);
    expect(selectCalendarDate("2026-01-12", null, "2026-01-10")).toEqual(["2026-01-10", "2026-01-12"]);
    expect(isDateSelected("2026-01-11", "2026-01-10", "2026-01-12")).toBe(true);
  });

  it("formats dates with a Buddhist year", () => {
    expect(formatBuddhistDate("2026-01-01")).toContain("2569");
  });
});
