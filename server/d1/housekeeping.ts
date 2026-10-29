import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { bookings, housekeepingTasks, hotelUsers, rooms } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import type { HousekeepingTaskStatus } from "../db/types";

type TaskInput = { room_id: string; booking_id?: string | null; assigned_to?: string | null; due_date?: string | null; status?: HousekeepingTaskStatus };

async function requireRoom(db: D1ScopedDatabase, hotelId: string, roomId: string) {
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(and(
    eq(rooms.id, roomId), eq(rooms.hotelId, hotelId),
  )).limit(1);
  if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found for housekeeping task." });
}

async function resolveDueDate(db: D1ScopedDatabase, hotelId: string, bookingId: string | null | undefined, dueDate: string | null | undefined) {
  if (bookingId) {
    const [booking] = await db.select({ checkOut: bookings.checkOut }).from(bookings).where(and(
      eq(bookings.id, bookingId), eq(bookings.hotelId, hotelId),
    )).limit(1);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found in this hotel." });
    return dueDate ?? booking.checkOut;
  }
  if (!dueDate) throw new TRPCError({ code: "BAD_REQUEST", message: "due_date is required when no booking is linked." });
  return dueDate;
}

async function requireAssigneeMembership(db: D1ScopedDatabase, hotelId: string, assignedTo: string | null | undefined) {
  if (!assignedTo) return;
  const [membership] = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(
    eq(hotelUsers.hotelId, hotelId), eq(hotelUsers.userId, assignedTo),
  )).limit(1);
  if (!membership) throw new TRPCError({ code: "BAD_REQUEST", message: `Assignee ${assignedTo} is not a member of this hotel.` });
}

export async function createHousekeepingTask(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  input: TaskInput,
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "housekeeping.update_room_status", "housekeeping.create", now);
  await requireRoom(db, hotelId, input.room_id);
  await requireAssigneeMembership(db, hotelId, input.assigned_to);
  const dueDate = await resolveDueDate(db, hotelId, input.booking_id, input.due_date);
  const [task] = await db.insert(housekeepingTasks).values({
    roomId: input.room_id,
    bookingId: input.booking_id ?? null,
    assignedTo: input.assigned_to ?? null,
    dueDate,
    status: input.status ?? "pending",
  }).returning();
  return task;
}

export async function listHousekeepingTasks(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "housekeeping.view_room_status", "housekeeping.list", now);
  return db.select({
    id: housekeepingTasks.id,
    roomId: housekeepingTasks.roomId,
    bookingId: housekeepingTasks.bookingId,
    assignedTo: housekeepingTasks.assignedTo,
    dueDate: housekeepingTasks.dueDate,
    status: housekeepingTasks.status,
    createdAt: housekeepingTasks.createdAt,
  }).from(housekeepingTasks).innerJoin(rooms, eq(housekeepingTasks.roomId, rooms.id))
    .where(eq(rooms.hotelId, hotelId)).orderBy(asc(housekeepingTasks.dueDate));
}

export async function updateHousekeepingTaskStatus(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  input: { task_id: string; status: HousekeepingTaskStatus; assigned_to?: string | null; booking_id?: string | null; due_date?: string | null },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "housekeeping.update_room_status", "housekeeping.update_status", now);
  const [existing] = await db.select({ task: housekeepingTasks }).from(housekeepingTasks)
    .innerJoin(rooms, eq(housekeepingTasks.roomId, rooms.id)).where(and(
      eq(housekeepingTasks.id, input.task_id), eq(rooms.hotelId, hotelId),
    )).limit(1);
  if (!existing) return null;
  if (input.assigned_to !== undefined) await requireAssigneeMembership(db, hotelId, input.assigned_to);
  const bookingId = input.booking_id === undefined ? existing.task.bookingId : input.booking_id;
  const dueDate = input.booking_id !== undefined
    ? (input.booking_id === null ? input.due_date ?? existing.task.dueDate : await resolveDueDate(db, hotelId, bookingId, input.due_date ?? null))
    : (bookingId ? await resolveDueDate(db, hotelId, bookingId, input.due_date ?? existing.task.dueDate) : input.due_date ?? existing.task.dueDate);
  const [updated] = await db.update(housekeepingTasks).set({
    status: input.status,
    ...(input.assigned_to !== undefined ? { assignedTo: input.assigned_to } : {}),
    ...(input.booking_id !== undefined ? { bookingId: input.booking_id } : {}),
    dueDate,
  }).where(and(eq(housekeepingTasks.id, input.task_id),
    sql`${housekeepingTasks.roomId} in (select id from rooms where hotel_id = ${hotelId})`)).returning();
  return updated ?? null;
}

export async function updateHousekeepingTask(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  taskId: string,
  patch: TaskInput,
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "housekeeping.update_room_status", "housekeeping.update", now);
  const [existing] = await db.select({ id: housekeepingTasks.id, bookingId: housekeepingTasks.bookingId })
    .from(housekeepingTasks).innerJoin(rooms, eq(housekeepingTasks.roomId, rooms.id)).where(and(
      eq(housekeepingTasks.id, taskId), eq(rooms.hotelId, hotelId),
    )).limit(1);
  if (!existing) return null;
  await requireRoom(db, hotelId, patch.room_id);
  if (patch.assigned_to !== undefined) await requireAssigneeMembership(db, hotelId, patch.assigned_to);
  const bookingId = patch.booking_id === undefined ? existing.bookingId : patch.booking_id;
  const dueDate = patch.booking_id !== undefined
    ? (patch.booking_id === null ? patch.due_date ?? undefined : await resolveDueDate(db, hotelId, bookingId, patch.due_date ?? null))
    : (bookingId ? await resolveDueDate(db, hotelId, bookingId, patch.due_date ?? undefined) : patch.due_date ?? undefined);
  const [updated] = await db.update(housekeepingTasks).set({
    roomId: patch.room_id,
    ...(patch.booking_id !== undefined ? { bookingId: patch.booking_id } : {}),
    ...(patch.assigned_to !== undefined ? { assignedTo: patch.assigned_to } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  }).where(and(eq(housekeepingTasks.id, taskId),
    sql`${housekeepingTasks.roomId} in (select id from rooms where hotel_id = ${hotelId})`)).returning();
  return updated ?? null;
}
