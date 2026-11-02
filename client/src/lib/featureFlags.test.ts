import { describe, expect, it } from "vitest";
import { isOtaSyncEnabled } from "./featureFlags";

describe("OTA sync feature flag", () => {
  it("is enabled only by the exact string true", () => {
    expect(isOtaSyncEnabled("true")).toBe(true);
    expect(isOtaSyncEnabled("TRUE")).toBe(false);
    expect(isOtaSyncEnabled("1")).toBe(false);
    expect(isOtaSyncEnabled(undefined)).toBe(false);
  });
});
