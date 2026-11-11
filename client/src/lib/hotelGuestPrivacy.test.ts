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
      expect(doc.sections[3]!.items!.join(" ")).toMatch(/Hayhost Thailand.*(data processor|ผู้ประมวลผลข้อมูล)/);
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

  it("lists the seven data subject rights, the 30-day answer and the right to complain", () => {
    for (const language of ["th", "en"] as const) {
      const rights = hotelGuestPrivacy(language, HOTEL).sections[7]!.items!;
      expect(rights.filter(item => /^\(\d\)/.test(item))).toHaveLength(7);
      expect(rights.at(-1)).toContain("30");
      expect(rights.at(-1)).toMatch(/Personal Data Protection Committee|คณะกรรมการคุ้มครองข้อมูลส่วนบุคคล/);
    }
  });

  it("tells guests what the booking system really collects and where it goes", () => {
    for (const language of ["th", "en"] as const) {
      const doc = hotelGuestPrivacy(language, HOTEL);
      const text = JSON.stringify(doc);
      expect(text).toMatch(/TM\.30|ตม\.30/);
      expect(text).toMatch(/passport|หนังสือเดินทาง/);
      expect(text).toMatch(/slip|สลิป/);
      expect(text).toMatch(/United States|สหรัฐอเมริกา/);
      expect(text).toContain("60");
      expect(doc.sections[1]!.table!.rows.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("lives under the hotel's own address", () => {
    expect(hotelPrivacyPath("littlebromhs")).toBe("/littlebromhs/privacy");
  });
});
