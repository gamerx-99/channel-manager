import { and, eq, min, sql } from "drizzle-orm";
import { hotelSubscriptions, hotelUsers, hotels, rooms } from "../../drizzle/d1-schema";
import { user as authUser } from "../../drizzle/auth-schema";
import { resolvePlan, type ResolvedPlan } from "@shared/plans";
import { cappedRoomIds, FREE_PLAN_ROOM_LIMIT } from "@shared/planRoomLimit";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

/** The server message for a staff booking on a room above the Free plan limit; the client translates it (serverErrors.freePlanRoomLimit). */
export const FREE_PLAN_ROOM_LIMIT_MESSAGE = "On the Free plan only the first 3 rooms can take new bookings. Upgrade to Pro to sell this room.";

/**
 * The plan of one hotel, with the same trial clock as listHotelsWithTrialClock in server/db/scope.ts:
 * the earliest hotel_owner account's creation date, or the hotel's own creation date when it has no owner.
 */
export async function resolveHotelPlan(db: D1ScopedDatabase, hotelId: string, now = new Date()): Promise<ResolvedPlan> {
  const [[hotel], [owner], [subscription]] = await Promise.all([
    db.select({ createdAt: hotels.createdAt }).from(hotels).where(eq(hotels.id, hotelId)).limit(1),
    db.select({ createdAt: min(authUser.createdAt) }).from(hotelUsers)
      .innerJoin(authUser, eq(authUser.id, hotelUsers.userId))
      .where(and(eq(hotelUsers.hotelId, hotelId), eq(hotelUsers.role, "hotel_owner"))),
    db.select({ paidUntil: hotelSubscriptions.paidUntil }).from(hotelSubscriptions).where(eq(hotelSubscriptions.hotelId, hotelId)).limit(1),
  ]);
  const ownerCreatedAt = owner?.createdAt ? new Date(owner.createdAt as unknown as number | Date) : null;
  const trialStartedAt = ownerCreatedAt ?? hotel?.createdAt ?? now;
  return resolvePlan({ ownerCreatedAt: trialStartedAt, paidUntil: subscription?.paidUntil ?? null, now });
}

/**
 * Every room of the hotel in creation order.
 * ASSUMPTION: rooms has no created_at column, so SQLite's rowid (insertion order) stands for creation order;
 * logged in .agent/OPEN_QUESTIONS.md.
 */
async function roomIdsInCreationOrder(db: D1ScopedDatabase, hotelId: string): Promise<string[]> {
  const rows = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hotelId, hotelId)).orderBy(sql`rooms.rowid`);
  return rows.map(row => row.id);
}

/** Rooms of the hotel that cannot take new bookings because of its plan (empty unless the plan is Free). No access check: internal use. */
export async function planCappedRoomIds(db: D1ScopedDatabase, hotelId: string, now = new Date()): Promise<string[]> {
  const plan = await resolveHotelPlan(db, hotelId, now);
  if (plan.plan !== "free") return [];
  return cappedRoomIds(await roomIdsInCreationOrder(db, hotelId), plan.plan);
}

/** For the back office: the plan, the limit and which rooms are held back. */
export async function getPlanRoomLimit(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "plan.room_limit.read", now);
  const plan = await resolveHotelPlan(db, hotelId, now);
  const roomIds = await roomIdsInCreationOrder(db, hotelId);
  const capped = cappedRoomIds(roomIds, plan.plan);
  return { plan: plan.plan, limit: plan.plan === "free" ? FREE_PLAN_ROOM_LIMIT : null, total_rooms: roomIds.length, capped_room_ids: capped };
}
