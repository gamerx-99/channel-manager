import { describe, expect, it } from "vitest";
import th from "../../lib/i18n/th";
import en from "../../lib/i18n/en";

const themes = ["mountainMist", "boutiqueNoir", "hostelPop", "riversideCalm"] as const;
const factOnlyKeys = {
  mountainMist: [],
  boutiqueNoir: ["suite", "locationSubtitle", "directGuarantee", "directGuaranteeBody"],
  hostelPop: ["heroBadge3", "heroPhotoBadge", "locationSubtitle"],
  riversideCalm: ["roomViewTag", "locationBadge"],
} as const;

describe("shared hotel theme copy", () => {
  it.each([["th", th], ["en", en]] as const)("keeps %s fixed copy free of sample property facts", (_language, dictionary) => {
    for (const theme of themes) {
      const copy = dictionary.hotelThemes[theme] as Record<string, string>;
      for (const key of factOnlyKeys[theme]) expect(copy).not.toHaveProperty(key);
      const values = Object.values(copy).join(" ");
      expect(values).not.toMatch(/แม่น้ำ|ริมน้ำ|วิว|เมืองเก่า|ไม้สัก|ผ้าทอ|ดาดฟ้า|แอร์เย็น|ล็อกเกอร์|ที่ชาร์จไฟ|ใจกลางเมือง|ใกล้|รับประกัน|ค่าธรรมเนียมแอบแฝง|Ping|river|view|ancient walls|teak|textiles|rooftop|air conditioning|lockers|sockets|city center|walkable|landmarks|guarantee|hidden fees/i);
    }
  });
});
