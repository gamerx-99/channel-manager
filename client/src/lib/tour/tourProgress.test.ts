import { describe, expect, it } from "vitest";
import { getTourProgress } from "./tourProgress";

const base = { hotel: { name: "Stay", address: "Road", ownerContact: "0812345678" }, roomTypes: [{ id: "type-1" }], rooms: [{ roomTypeId: "type-1" }], skippedAt: null, completedAt: null };
describe("getTourProgress", () => {
  it("requires all required hotel fields and one room belonging to a room type", () => {
    expect(getTourProgress(base)).toEqual({ hotelSettingsDone: true, roomsDone: true, financeDone: true, shouldAutoStart: false });
    expect(getTourProgress({ ...base, hotel: { ...base.hotel, address: " " } })).toMatchObject({ hotelSettingsDone: false, shouldAutoStart: true });
    expect(getTourProgress({ ...base, rooms: [] })).toMatchObject({ roomsDone: false, shouldAutoStart: true });
    expect(getTourProgress({ ...base, rooms: [{ roomTypeId: "other" }] })).toMatchObject({ roomsDone: false });
  });
  it("reports finance as done unless the caller says it is not, and never lets it start the tour", () => {
    expect(getTourProgress(base).financeDone).toBe(true);
    expect(getTourProgress({ ...base, financeDone: false })).toMatchObject({ financeDone: false, shouldAutoStart: false });
    expect(getTourProgress({ ...base, financeDone: true })).toMatchObject({ financeDone: true, shouldAutoStart: false });
    expect(getTourProgress({ ...base, rooms: [], financeDone: false })).toMatchObject({ roomsDone: false, financeDone: false, shouldAutoStart: true });
  });
  it("does not auto-start after skip or completion", () => {
    expect(getTourProgress({ ...base, skippedAt: 1 }).shouldAutoStart).toBe(false);
    expect(getTourProgress({ ...base, completedAt: 1 }).shouldAutoStart).toBe(false);
  });
});
