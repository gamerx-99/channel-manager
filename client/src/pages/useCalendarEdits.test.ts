import { describe, expect, it } from "vitest";
import { buildCalendarSaveInputs, emptyRoomTypeEdit } from "./useCalendarEdits";

const ids = ["deluxe", "family"];
const input = (edits: Parameters<typeof buildCalendarSaveInputs>[1]) =>
  buildCalendarSaveInputs(ids, edits, "hotel", "2026-11-29", "2026-11-29", true, true);

describe("per-room-type calendar payloads", () => {
  it("sends only Deluxe when Family is untouched", () => {
    expect(input({ deluxe: { ...emptyRoomTypeEdit, price: "1500" } })).toEqual([{
      hotel_id: "hotel", room_type_ids: ["deluxe"], start_date: "2026-11-29", end_date: "2026-11-29", price: 1500,
    }]);
  });

  it("keeps different prices, rooms, and base-price choices on their own types", () => {
    expect(input({
      deluxe: { rooms: "2", price: "1500", minimum: "2", useBase: false },
      family: { rooms: "1", price: "2200", minimum: "", useBase: false },
    })).toEqual([
      { hotel_id: "hotel", room_type_ids: ["deluxe"], start_date: "2026-11-29", end_date: "2026-11-29", rooms_available: 2, price: 1500, min_stay_nights: 2 },
      { hotel_id: "hotel", room_type_ids: ["family"], start_date: "2026-11-29", end_date: "2026-11-29", rooms_available: 1, price: 2200 },
    ]);
    expect(input({ deluxe: { ...emptyRoomTypeEdit, price: "1500" }, family: { ...emptyRoomTypeEdit, price: "2200", useBase: true } })[1]).toEqual({
      hotel_id: "hotel", room_type_ids: ["family"], start_date: "2026-11-29", end_date: "2026-11-29", base: true,
    });
  });
});
