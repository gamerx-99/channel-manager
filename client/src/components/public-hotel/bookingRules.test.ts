import { describe, expect, it } from "vitest";
import {
  isDatesValid,
  areGuestsValid,
  countNights,
  parseChildMeasurements,
  isChildWithinLimit,
  serviceLineTotal,
  selectedServicesTotal,
} from "./bookingRules";

describe("bookingRules", () => {
  it("validates dates", () => {
    expect(isDatesValid("2026-11-04", "2026-11-05")).toBe(true);
    expect(isDatesValid("2026-11-04", "2026-11-04")).toBe(false);
    expect(isDatesValid(null, "2026-11-05")).toBe(false);
  });

  it("validates guests", () => {
    expect(areGuestsValid(1, [])).toBe(true);
    expect(areGuestsValid(0, [])).toBe(false);
    expect(areGuestsValid(1, [""])).toBe(false);
    expect(areGuestsValid(1, ["5"])).toBe(true);
  });

  it("counts nights", () => {
    expect(countNights("2026-11-04", "2026-11-06")).toBe(2);
    expect(countNights("2026-11-04", "2026-11-04")).toBe(0);
  });

  it("parses child measurements", () => {
    expect(parseChildMeasurements(["5", "10"], "age")).toEqual([{ age: 5 }, { age: 10 }]);
    expect(parseChildMeasurements(["120"], "height")).toEqual([{ height_cm: 120 }]);
    expect(parseChildMeasurements([""], "age")).toEqual([]);
  });

  it("checks child limits", () => {
    expect(isChildWithinLimit("17", "age")).toBe(true);
    expect(isChildWithinLimit("18", "age")).toBe(false);
    expect(isChildWithinLimit("250", "height")).toBe(true);
    expect(isChildWithinLimit("251", "height")).toBe(false);
  });

  it("calculates service line total", () => {
    const service = { id: "s1", name: "Breakfast", pricingModel: "PER_NIGHT", unitPrice: 100 };
    expect(serviceLineTotal(service, 2, 3)).toBe(600);
    const oneTime = { id: "s2", name: "Transfer", pricingModel: "ONE_TIME", unitPrice: 50 };
    expect(serviceLineTotal(oneTime, 2, 3)).toBe(100);
  });

  it("calculates selected services total", () => {
    const services = [
      { id: "s1", name: "Breakfast", pricingModel: "PER_NIGHT", unitPrice: 100 },
      { id: "s2", name: "Transfer", pricingModel: "ONE_TIME", unitPrice: 50 },
    ];
    expect(selectedServicesTotal(services, { s1: 2, s2: 1 }, 3)).toBe(650);
  });
});