import { describe, expect, it } from "vitest";
import th from "./th";
import en from "./en";

// Terms banned by docs/thai-glossary.md: literal translations that Thai owners do not use.
const BANNED_THAI_TERMS = ["กุญแจ", "แบบสด", "ข้อมูลสด", "พร็อพเพอร์ตี้", "ดีพลอย", "ปรับใช้", "อินสแตนซ์", "โฮสต์", "แผงควบคุม"];

type Dictionary = { [key: string]: string | Dictionary };

function flatten(dictionary: Dictionary, prefix = ""): Record<string, string> {
  return Object.entries(dictionary).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const thai = flatten(th as unknown as Dictionary);
const english = flatten(en as unknown as Dictionary);

describe("Thai glossary", () => {
  it("uses none of the banned literal translations", () => {
    const hits = Object.entries(thai).flatMap(([key, value]) =>
      BANNED_THAI_TERMS.filter(term => value.includes(term)).map(term => `${key}: "${term}" in "${value}"`));
    expect(hits).toEqual([]);
  });

  it("has a Thai string for every English key and no extra Thai keys", () => {
    expect(Object.keys(thai).filter(key => !(key in english))).toEqual([]);
    expect(Object.keys(english).filter(key => !(key in thai))).toEqual([]);
  });
});
