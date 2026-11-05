import { describe, expect, it } from "vitest";
import { planHasEnd, planNameKey, signInMethod, valueOrEmpty } from "./accountProfile";

describe("account page helpers", () => {
  it("names the sign-in methods", () => {
    expect(signInMethod("credential")).toEqual({ key: "account.methodPassword" });
    expect(signInMethod("google")).toEqual({ label: "Google" });
    expect(signInMethod("line")).toEqual({ label: "LINE" });
    expect(signInMethod("facebook")).toEqual({ label: "Facebook" });
    expect(signInMethod("some-new-provider")).toEqual({ label: "some-new-provider" });
  });

  it("treats blank values as not provided", () => {
    expect(valueOrEmpty(null)).toBeNull();
    expect(valueOrEmpty(undefined)).toBeNull();
    expect(valueOrEmpty("   ")).toBeNull();
    expect(valueOrEmpty(" 0812345678 ")).toBe("0812345678");
  });

  it("reuses the subscription page names for the plan", () => {
    expect(planNameKey("pro")).toBe("subscription.pro");
    expect(planNameKey("trial")).toBe("subscription.trial");
    expect(planNameKey("free")).toBe("subscription.free");
  });

  it("shows an end date only for a plan that runs out", () => {
    expect(planHasEnd("pro", new Date())).toBe(true);
    expect(planHasEnd("trial", "2026-12-01T00:00:00.000Z")).toBe(true);
    expect(planHasEnd("free", null)).toBe(false);
    expect(planHasEnd("pro", null)).toBe(false);
  });
});
