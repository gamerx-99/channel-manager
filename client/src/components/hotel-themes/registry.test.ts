import { describe, expect, it } from "vitest";
import { HOTEL_THEMES } from "@shared/hotelThemes";
import { getHotelThemeLanding, getHotelThemeRegistryEntry, HOTEL_THEME_REGISTRY } from "./registry";
import MinimalWhite from "./minimal-white/MinimalWhite";
import LannaTeak from "./lanna-teak/LannaTeak";
import CafeHomestay from "./cafe-homestay/CafeHomestay";
import MountainMist from "./mountain-mist/MountainMist";
import BoutiqueNoir from "./boutique-noir/BoutiqueNoir";

describe("hotel theme registry", () => {
  it.each([
    ["minimal-white", MinimalWhite],
    ["lanna-teak", LannaTeak],
    ["cafe-homestay", CafeHomestay],
    ["mountain-mist", MountainMist],
    ["boutique-noir", BoutiqueNoir],
  ] as const)("returns the landing for %s", (id, component) => {
    expect(getHotelThemeRegistryEntry(id)?.landing).toBe(component);
  });

  it("uses the supplied default landing for missing and unknown ids", () => {
    const DefaultLanding = () => null;
    expect(getHotelThemeLanding(null, DefaultLanding)).toBe(DefaultLanding);
    expect(getHotelThemeLanding("unknown-theme", DefaultLanding)).toBe(DefaultLanding);
  });

  it("has exactly one registry entry for every published theme id", () => {
    const publishedIds = new Set(HOTEL_THEMES.map(theme => theme.id));
    const registeredIds = new Set(Object.keys(HOTEL_THEME_REGISTRY));
    expect([...publishedIds].every(id => registeredIds.has(id))).toBe(true);
    expect([...registeredIds].every(id => publishedIds.has(id as typeof HOTEL_THEMES[number]["id"]))).toBe(true);
  });
});
