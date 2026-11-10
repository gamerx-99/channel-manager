import { describe, expect, it } from "vitest";
import { hotelSiteConfigSaveSchema, setHotelMediaObjectPositionSchema } from "./routers/hotelRouter";

describe("hotel media focal point input", () => {
  const base = { hotel_id: "00000000-0000-4000-8000-000000000001", media_id: "00000000-0000-4000-8000-000000000002" };
  it("accepts integer percentages from 0 to 100 and null", () => {
    expect(setHotelMediaObjectPositionSchema.parse({ ...base, object_position: "0% 100%" }).object_position).toBe("0% 100%");
    expect(setHotelMediaObjectPositionSchema.parse({ ...base, object_position: null }).object_position).toBeNull();
  });
  it.each(["101% 50%", "-1% 50%", "50.5% 50%", "50%50%", "50% 50.0%", "00% 50%"]) ("rejects invalid value %s", object_position => {
    expect(setHotelMediaObjectPositionSchema.safeParse({ ...base, object_position }).success).toBe(false);
  });

  it.each(["50% 40%", "0% 100%", "100% 0%"])("accepts media focal point %s when saving a theme", media_position => {
    expect(hotelSiteConfigSaveSchema.parse({ hotel_id: base.hotel_id, theme: "lanna-teak", media_positions: { [base.media_id]: media_position } }))
      .toMatchObject({ theme: "lanna-teak", media_positions: { [base.media_id]: media_position } });
  });

  it.each(["101% 0%", "50%40%", "abc"])("rejects invalid saved media focal point %s", media_position => {
    expect(hotelSiteConfigSaveSchema.safeParse({ hotel_id: base.hotel_id, theme: "lanna-teak", media_positions: { [base.media_id]: media_position } }).success).toBe(false);
  });
});
