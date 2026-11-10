import { describe, expect, it } from "vitest";
import { monthShiftHours, shiftEndDate, shiftHours } from "./staffShifts";

describe("staff shift hours", () => {
  it("subtracts break time and counts an end-before-start shift into the next day", () => {
    expect(shiftHours({ start_time: "08:00", end_time: "17:00", break_minutes: 60 })).toBe(8);
    expect(shiftEndDate("2026-11-06", "22:00", "06:00")).toBe("2026-11-07");
    expect(shiftHours({ start_time: "22:00", end_time: "06:00", break_minutes: 30 })).toBe(7.5);
  });
  it("totals all shift minutes for the month", () => {
    expect(monthShiftHours([{ start_time: "08:00", end_time: "17:00", break_minutes: 60 }, { start_time: "09:00", end_time: "13:00", break_minutes: 0 }])).toBe(12);
  });
});
