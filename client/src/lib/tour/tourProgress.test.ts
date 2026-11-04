import { describe, expect, it } from "vitest";
import { getTourProgress } from "./tourProgress";

const base = { hotel: { name: "Stay", address: "Road", ownerContact: "0812345678" }, roomTypes: [{ id: "type-1" }], rooms: [{ roomTypeId: "type-1" }], skippedAt: null, completedAt: null };
describe("getTourProgress", () => {
  it("requires all required hotel fields and one room belonging to a room type", () => {
    expect(getTourProgress(base)).toEqual({ hotelSettingsDone: true, roomsDone: true, shouldAutoStart: false });
    expect(getTourProgress({ ...base, hotel: { ...base.hotel, address: " " } })).toMatchObject({ hotelSettingsDone: false, shouldAutoStart: true });
    expect(getTourProgress({ ...base, rooms: [] })).toMatchObject({ roomsDone: false, shouldAutoStart: true });
    expect(getTourProgress({ ...base, rooms: [{ roomTypeId: "other" }] })).toMatchObject({ roomsDone: false });
  });
  it("does not auto-start after skip or completion", () => {
    expect(getTourProgress({ ...base, skippedAt: 1 }).shouldAutoStart).toBe(false);
    expect(getTourProgress({ ...base, completedAt: 1 }).shouldAutoStart).toBe(false);
  });
});
