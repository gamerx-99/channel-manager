import { describe, expect, it } from "vitest";
import { hotelGuestPrivacy, hotelPrivacyPath } from "./hotelGuestPrivacy";

const HOTEL = { name: "Little Bro Mae Hong Son", address: "1 Khunlum Prapas Rd", public_phone: "081-000-0000", facebook_url: null, line_url: "https://line.me/R/ti/p/@x" };

function allText(language: "th" | "en", hotel = HOTEL) {
  const doc = hotelGuestPrivacy(language, hotel);
  return [doc.intro, ...doc.sections.flatMap(section => [section.heading, ...(section.items ?? [])])].join("\n");
}

describe("hotel privacy notice for guests", () => {
  it("names the hotel as the data controller and Hayhost as its processor", () => {
    for (const language of ["th", "en"] as const) {
      const doc = hotelGuestPrivacy(language, HOTEL);
      expect(doc.intro).toContain("Little Bro Mae Hong Son");
      expect(doc.intro).toContain("Hayhost Thailand");
      expect(doc.sections).toHaveLength(10);
    }
    expect(hotelGuestPrivacy("th", HOTEL).intro).toContain("ผู้ควบคุมข้อมูลส่วนบุคคล");
  });

  it("speaks of the hotel, never of a company, in Thai", () => {
    expect(allText("th").replace(/บริษัทในเครือ/g, "")).not.toContain("บริษัท");
  });

  it("lists only the contact details the hotel shows publicly, with Hayhost as the fallback", () => {
    const contact = hotelGuestPrivacy("th", HOTEL).sections.at(-1)!.items!;
    expect(contact).toEqual([
      "ผู้ควบคุมข้อมูลส่วนบุคคล: Little Bro Mae Hong Son",
      "ที่อยู่: 1 Khunlum Prapas Rd",
      "โทร: 081-000-0000",
      "LINE: https://line.me/R/ti/p/@x",
      expect.stringContaining("support@hayhostth.com"),
    ]);
    const bare = hotelGuestPrivacy("en", { name: "Quiet Inn", address: " ", public_phone: null }).sections.at(-1)!.items!;
    expect(bare).toEqual(["Data controller: Quiet Inn", expect.stringContaining("support@hayhostth.com")]);
  });

  it("keeps the owner's six data subject rights and the 30-day answer", () => {
    for (const language of ["th", "en"] as const) {
      const rights = hotelGuestPrivacy(language, HOTEL).sections[7]!.items!;
      expect(rights.filter(item => /^\(\d\)/.test(item))).toHaveLength(6);
      expect(rights.at(-1)).toContain("30");
    }
  });

  it("lives under the hotel's own address", () => {
    expect(hotelPrivacyPath("littlebromhs")).toBe("/littlebromhs/privacy");
  });
});
