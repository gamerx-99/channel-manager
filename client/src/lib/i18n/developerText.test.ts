import { describe, expect, it } from "vitest";
import { en, th } from "./index";

/** Words for developers, not hotel owners: column and procedure names, internal docs, old infrastructure. */
const DEVELOPER_TEXT = /hero_copy|accent_color|visible_sections|saveHotelSiteConfig|getHotelSiteConfig|DECISIONS\.md|room_type_id|hotel_site_config|hotel_media|hotel_users|public\.\w+|\.tsx\b|Supabase|\bRLS\b/;

function strings(dictionary: unknown, path = ""): Array<[string, string]> {
  if (typeof dictionary === "string") return [[path, dictionary]];
  if (!dictionary || typeof dictionary !== "object") return [];
  return Object.entries(dictionary).flatMap(([key, value]) => strings(value, path ? `${path}.${key}` : key));
}

describe("i18n dictionaries", () => {
  it.each([["en", en], ["th", th]] as const)("%s shows no developer text to users", (_language, dictionary) => {
    const offenders = strings(dictionary).filter(([, value]) => DEVELOPER_TEXT.test(value)).map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });
});
