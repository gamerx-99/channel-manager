import { describe, expect, it } from "vitest";
import { isDayInPickedRange, nextPickedRange } from "./pricingDayPick";

const empty = { start_date: "", end_date: "" };

describe("nextPickedRange", () => {
  it("first click sets the start date", () => {
    expect(nextPickedRange(empty, "2026-12-10")).toEqual({ start_date: "2026-12-10", end_date: "" });
  });
  it("second click sets the end date", () => {
    expect(nextPickedRange({ start_date: "2026-12-10", end_date: "" }, "2026-12-14")).toEqual({ start_date: "2026-12-10", end_date: "2026-12-14" });
  });
  it("same day twice is a one-day range", () => {
    expect(nextPickedRange({ start_date: "2026-12-10", end_date: "" }, "2026-12-10")).toEqual({ start_date: "2026-12-10", end_date: "2026-12-10" });
  });
  it("a day before the start starts over", () => {
    expect(nextPickedRange({ start_date: "2026-12-10", end_date: "" }, "2026-12-05")).toEqual({ start_date: "2026-12-05", end_date: "" });
  });
  it("a click after a full range starts over", () => {
    expect(nextPickedRange({ start_date: "2026-12-10", end_date: "2026-12-14" }, "2026-12-20")).toEqual({ start_date: "2026-12-20", end_date: "" });
  });
});

describe("isDayInPickedRange", () => {
  it("is false with no start", () => {
    expect(isDayInPickedRange(empty, "2026-12-10")).toBe(false);
  });
  it("marks only the start while the end is open", () => {
    const range = { start_date: "2026-12-10", end_date: "" };
    expect(isDayInPickedRange(range, "2026-12-10")).toBe(true);
    expect(isDayInPickedRange(range, "2026-12-11")).toBe(false);
  });
  it("marks every day of a full range", () => {
    const range = { start_date: "2026-12-10", end_date: "2026-12-12" };
    expect(["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"].map(d => isDayInPickedRange(range, d))).toEqual([false, true, true, true, false]);
  });
});
