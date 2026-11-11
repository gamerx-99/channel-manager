import type { ResolvedPlan } from "./plans";

/** Free plan: this many rooms in total can take new bookings (owner decision, 2026-11-02 and 2026-11-11). */
export const FREE_PLAN_ROOM_LIMIT = 3;

/**
 * Rooms that cannot take new bookings because of the plan, given every room of the hotel in creation order.
 * Trial and Pro have no limit. On Free, the first FREE_PLAN_ROOM_LIMIT rooms (all room types together) keep
 * selling and the rest are capped; their data and existing bookings stay as they are.
 */
export function cappedRoomIds(roomIdsInCreationOrder: readonly string[], plan: ResolvedPlan["plan"]): string[] {
  if (plan !== "free") return [];
  return roomIdsInCreationOrder.slice(FREE_PLAN_ROOM_LIMIT);
}
