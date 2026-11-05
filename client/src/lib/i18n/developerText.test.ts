import { describe, expect, it } from "vitest";
import { en, th } from "./index";

/** Internal identifiers and infrastructure names have no meaning to hotel owners. */
const DEVELOPER_TEXT = /(?<![\w.])(?:property|operations|revenue|housekeeping|platform|ota)\.[a-z_]+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b(?:Supabase|RLS|tRPC|D1|cron|migration|ASSUMPTION)\b|saveHotelSiteConfig|getHotelSiteConfig|DECISIONS\.md|public\.\w+|\.tsx\b/i;

// Product names approved in docs/thai-glossary.md (OTA, iCal, LINE, Google,
// SlipOK, PromptPay, TM.30) are intentionally outside the pattern above.
// The permission pattern also excludes domain segments such as www.ota.com.

function strings(dictionary: unknown, path = ""): Array<[string, string]> {
  if (typeof dictionary === "string") return [[path, dictionary]];
  if (!dictionary || typeof dictionary !== "object") return [];
  return Object.entries(dictionary).flatMap(([key, value]) => strings(value, path ? `${path}.${key}` : key));
}

describe("i18n dictionaries", () => {
  it.each([
    "property.view_financials", "operations.manage_bookings", "revenue.manage_allotment",
    "housekeeping.update_room_status", "platform.manage_users", "ota.manage_sync",
    "hotel_domains", "min_stay_nights", "display_order",
    "Supabase", "RLS", "tRPC", "D1", "cron", "migration", "ASSUMPTION",
  ])("rejects the internal term %s", (value) => {
    expect(DEVELOPER_TEXT.test(value)).toBe(true);
  });

  it.each(["OTA", "iCal", "LINE", "Google", "SlipOK", "PromptPay", "TM.30", "https://www.ota.com/calendar/export/..."])(
    "allows owner-facing term %s", (value) => {
      expect(DEVELOPER_TEXT.test(value)).toBe(false);
    },
  );

  it.each([["en", en], ["th", th]] as const)("%s shows no developer text to users", (_language, dictionary) => {
    const offenders = strings(dictionary).filter(([, value]) => DEVELOPER_TEXT.test(value)).map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });
});
