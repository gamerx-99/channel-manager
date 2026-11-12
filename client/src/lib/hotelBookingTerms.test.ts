import { describe, expect, it } from "vitest";
import { hotelBookingTerms, hotelBookingTermsPath } from "./hotelBookingTerms";

const hotel = { name: "Little Bro Mae Hong Son", address: "41/3 Pang Mu", public_phone: "0615125679", facebook_url: null, line_url: null };

describe("hotel booking conditions for guests", () => {
  it("names the hotel as the party, puts refunds with the hotel and lists its contacts", () => {
    const doc = hotelBookingTerms("th", hotel, "littlebromhs");
    const text = [doc.intro, ...doc.sections.flatMap(section => [section.heading, ...(section.items ?? [])])].join("\n");
    expect(doc.intro).toContain("Little Bro Mae Hong Son");
    expect(text).toContain("Hayhost ไม่ได้รับหรือถือเงินของคุณ");
    expect(text).toContain("0615125679");
    expect(text).toContain("/littlebromhs/privacy");
    // Nothing from the hotel-owner contract (fees, account suspension) reaches the guest page.
    expect(text).not.toContain("ค่าบริการ");
    expect(text).not.toContain("ระงับบัญชี");
  });

  it("has an English version and a stable path", () => {
    expect(hotelBookingTerms("en", hotel, "littlebromhs").intro).toContain("Your agreement is with the Hotel");
    expect(hotelBookingTermsPath("little bro")).toBe("/little%20bro/booking-terms");
  });
});
