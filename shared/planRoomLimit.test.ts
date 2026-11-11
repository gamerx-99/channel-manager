import { describe, expect, it } from "vitest";
import { cappedRoomIds, FREE_PLAN_ROOM_LIMIT } from "./planRoomLimit";

const rooms = (count: number) => Array.from({ length: count }, (_, index) => `room-${index + 1}`);

describe("cappedRoomIds", () => {
  it("caps nothing on trial or Pro, however many rooms", () => {
    expect(cappedRoomIds(rooms(10), "trial")).toEqual([]);
    expect(cappedRoomIds(rooms(10), "pro")).toEqual([]);
  });

  it("caps nothing on Free with 3 rooms or fewer", () => {
    expect(FREE_PLAN_ROOM_LIMIT).toBe(3);
    expect(cappedRoomIds(rooms(2), "free")).toEqual([]);
    expect(cappedRoomIds(rooms(3), "free")).toEqual([]);
  });

  it("caps every room after the first three by creation order on Free", () => {
    expect(cappedRoomIds(rooms(5), "free")).toEqual(["room-4", "room-5"]);
  });

  it("follows the order it is given, not room numbers", () => {
    expect(cappedRoomIds(["b", "a", "d", "c"], "free")).toEqual(["c"]);
  });
});
