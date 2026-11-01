import { describe, expect, it } from "vitest";
import { pickInitialLanguage } from "./LanguageContext";

describe("pickInitialLanguage", () => {
  it("keeps the landing and signup pages in Thai", () => {
    expect(pickInitialLanguage("/", ["en-US"])).toBe("th");
    expect(pickInitialLanguage("/signup", ["en-US"])).toBe("th");
  });

  it("opens other pages in Thai for a Thai browser (regression: /login and hotel pages were English)", () => {
    expect(pickInitialLanguage("/login", ["th-TH", "en"])).toBe("th");
    expect(pickInitialLanguage("/baan-qa", ["th"])).toBe("th");
  });

  it("uses English for other browsers", () => {
    expect(pickInitialLanguage("/login", ["en-GB", "th"])).toBe("en");
    expect(pickInitialLanguage("/baan-qa", ["ja-JP"])).toBe("en");
    expect(pickInitialLanguage("/login", [])).toBe("en");
  });
});
