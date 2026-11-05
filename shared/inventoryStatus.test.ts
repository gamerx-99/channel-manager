import { describe, expect, it } from "vitest";
import { inventoryStatus } from "./inventoryStatus";

describe("inventoryStatus", () => {
  it("treats a fully available day as healthy, even for a one-room property (regression: 1/1 showed as low)", () => {
    expect(inventoryStatus(1, 1)).toBe("healthy");
    expect(inventoryStatus(2, 2)).toBe("healthy");
    expect(inventoryStatus(8, 8)).toBe("healthy");
  });

  it("marks a day closed when nothing is left", () => {
    expect(inventoryStatus(0, 1)).toBe("closed");
    expect(inventoryStatus(0, 10)).toBe("closed");
    expect(inventoryStatus(-1, 3)).toBe("closed");
  });

  it("marks a day low once some rooms are taken and a quarter or less is left", () => {
    expect(inventoryStatus(1, 2)).toBe("low");
    expect(inventoryStatus(1, 4)).toBe("low");
    expect(inventoryStatus(2, 8)).toBe("low");
    expect(inventoryStatus(1, 10)).toBe("low");
  });

  it("keeps a day healthy while more than a quarter is left", () => {
    expect(inventoryStatus(3, 8)).toBe("healthy");
    expect(inventoryStatus(5, 10)).toBe("healthy");
  });
});
