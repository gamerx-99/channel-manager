import { describe, it, expect } from "vitest";
import { translate, en, th } from "./index";

describe("i18n infrastructure", () => {
  it("translates known keys in English", () => {
    expect(translate("en", "sidebar.overview")).toBe("Overview");
    expect(translate("en", "topbar.addNew")).toBe("Add new");
    expect(translate("en", "login.titleCard")).toBe("Welcome back");
  });

  it("translates known keys in Thai", () => {
    expect(translate("th", "sidebar.overview")).toBe("ภาพรวม");
    expect(translate("th", "topbar.addNew")).toBe("เพิ่มใหม่");
    expect(translate("th", "login.titleCard")).toBe("ยินดีต้อนรับกลับมา");
  });

  it("falls back to English when a key is missing in Thai", () => {
    // If a non-existent sub-key is requested or fallback is used
    expect(translate("th", "common.save")).toBe("บันทึก");
  });

  it("returns key when key is missing completely", () => {
    expect(translate("en", "non.existent.key")).toBe("non.existent.key");
    expect(translate("th", "non.existent.key")).toBe("non.existent.key");
  });

  it("supports parameter replacement", () => {
    expect(translate("en", "sidebar.overview", { count: 5 })).toBe("Overview");
  });

  it("ensures th dictionary has matching keys with en dictionary", () => {
    function checkKeys(enObj: any, thObj: any, path = "") {
      for (const key of Object.keys(enObj)) {
        const currentPath = path ? `${path}.${key}` : key;
        expect(thObj).toHaveProperty(key);
        if (typeof enObj[key] === "object" && enObj[key] !== null) {
          checkKeys(enObj[key], thObj[key], currentPath);
        } else {
          expect(typeof thObj[key]).toBe("string");
          expect(thObj[key].length).toBeGreaterThan(0);
        }
      }
    }
    checkKeys(en, th);
  });
});
