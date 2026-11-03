import { describe, expect, it } from "vitest";
import { setHotelMediaObjectPositionSchema } from "./routers/hotelRouter";

describe("hotel media focal point input", () => {
  const base = { hotel_id: "00000000-0000-4000-8000-000000000001", media_id: "00000000-0000-4000-8000-000000000002" };
  it("accepts integer percentages from 0 to 100 and null", () => {
    expect(setHotelMediaObjectPositionSchema.parse({ ...base, object_position: "0% 100%" }).object_position).toBe("0% 100%");
    expect(setHotelMediaObjectPositionSchema.parse({ ...base, object_position: null }).object_position).toBeNull();
  });
  it.each(["101% 50%", "-1% 50%", "50.5% 50%", "50%50%", "50% 50.0%", "00% 50%"]) ("rejects invalid value %s", object_position => {
    expect(setHotelMediaObjectPositionSchema.safeParse({ ...base, object_position }).success).toBe(false);
  });
});
