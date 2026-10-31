import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { notifications } from "../../drizzle/d1-schema";
import { authorizeHotelAction, authorizePlatformAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export async function listNotifications(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "notifications.list", now);
  return db.select().from(notifications).where(eq(notifications.hotelId, hotelId))
    .orderBy(desc(notifications.createdAt)).limit(50);
}

export async function listAllNotifications(db: D1ScopedDatabase, caller: D1CallerContext) {
  await authorizePlatformAction(db, caller, "platform.view_all_hotels");
  // ASSUMPTION: there is no separate platform-notification table yet. Hotel
  // notification bodies are private hotel data, so the global feed is empty.
  return [] as (typeof notifications.$inferSelect)[];
}

export async function markNotificationRead(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  notificationId: string,
  hotelId: string,
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "notifications.mark_read", now);
  const [row] = await db.update(notifications).set({ isRead: true }).where(and(
    eq(notifications.id, notificationId), eq(notifications.hotelId, hotelId),
  )).returning();
  return row ?? null;
}

export async function markAllNotificationsRead(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "notifications.mark_all_read", now);
  await db.update(notifications).set({ isRead: true }).where(and(
    eq(notifications.hotelId, hotelId), eq(notifications.isRead, false),
  ));
}

export async function markSystemNotificationsRead(db: D1ScopedDatabase, caller: D1CallerContext) {
  await authorizePlatformAction(db, caller, "platform.view_all_hotels");
  throw new TRPCError({ code: "FORBIDDEN", message: "Platform accounts cannot modify hotel notifications." });
}

export async function insertNotification(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotelId: string; type: string; message: string },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotelId, "operations.manage_bookings", "notifications.insert", now);
  const [row] = await db.insert(notifications).values({ hotelId: input.hotelId, type: input.type, message: input.message }).returning();
  return row;
}
