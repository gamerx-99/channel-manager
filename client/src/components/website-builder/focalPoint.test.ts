import { describe, expect, it } from "vitest";
import { clampPercent, formatFocalPoint, parseFocalPoint, pointFromPointer } from "./focalPoint";

describe("focal point", () => {
  it("parses stored positions and defaults missing or invalid values to the centre", () => {
    expect(parseFocalPoint("25% 75%")).toEqual({ x: 25, y: 75 });
    expect(parseFocalPoint(null)).toEqual({ x: 50, y: 50 });
    expect(parseFocalPoint("invalid")).toEqual({ x: 50, y: 50 });
    expect(parseFocalPoint("120% 0%")).toEqual({ x: 100, y: 0 });
  });

  it("clamps, rounds and formats percent coordinates", () => {
    expect(clampPercent(-12)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(formatFocalPoint({ x: 24.6, y: 75.1 })).toBe("25% 75%");
  });

  it("maps pointer coordinates within an offset image and clamps outside it", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(pointFromPointer(150, 125, rect)).toEqual({ x: 25, y: 75 });
    expect(pointFromPointer(0, 500, rect)).toEqual({ x: 0, y: 100 });
    expect(pointFromPointer(150, 125, { ...rect, width: 0 })).toEqual({ x: 50, y: 50 });
  });
});
