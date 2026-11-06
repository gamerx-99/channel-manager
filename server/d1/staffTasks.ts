import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { hotelUsers, rooms, staffShifts, staffTasks } from "../../drizzle/d1-schema";
import { user } from "../../drizzle/auth-schema";
import { getStaffTaskWaitingState, isStaffTaskVisibleToAssignee } from "../../shared/staffTaskVisibility";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export type StaffTaskInput = { assigned_to: string; task_date: string; title: string; details?: string | null; room_id?: string | null };

async function ensureMembership(db: D1ScopedDatabase, hotelId: string, membershipId: string) {
  const [member] = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(eq(hotelUsers.id, membershipId), eq(hotelUsers.hotelId, hotelId), sql`${hotelUsers.role} <> 'hotel_owner'`)).limit(1);
  if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "Staff member not found in this hotel." });
}

async function ensureRoom(db: D1ScopedDatabase, hotelId: string, roomId?: string | null) {
  if (!roomId) return;
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.hotelId, hotelId))).limit(1);
  if (!room) throw new TRPCError({ code: "BAD_REQUEST", message: "Room not found in this hotel." });
}

function taskRecord(row: typeof staffTasks.$inferSelect, member: { full_name: string | null; position: string | null; room_number?: string | null }) {
  return { id: row.id, hotel_id: row.hotelId, assigned_to: row.assignedTo, task_date: row.taskDate, title: row.title, details: row.details, room_id: row.roomId, status: row.status, created_at: row.createdAt, completed_at: row.completedAt, completed_by: row.completedBy, assignee_name: member.full_name, assignee_position: member.position, room_number: member.room_number ?? null };
}

export async function listStaffTasks(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, from: string, to: string, assignedTo?: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_tasks", "staff_tasks.list", now);
  const rows = await db.select({ task: staffTasks, fullName: sql<string | null>`coalesce(${hotelUsers.fullName}, ${user.name})`, position: hotelUsers.position, roomNumber: rooms.roomNumber })
    .from(staffTasks).innerJoin(hotelUsers, eq(staffTasks.assignedTo, hotelUsers.id)).leftJoin(user, eq(user.id, hotelUsers.userId)).leftJoin(rooms, eq(rooms.id, staffTasks.roomId))
    .where(and(eq(staffTasks.hotelId, hotelId), gte(staffTasks.taskDate, from), lte(staffTasks.taskDate, to), ...(assignedTo ? [eq(staffTasks.assignedTo, assignedTo)] : [])))
    .orderBy(asc(staffTasks.taskDate), asc(hotelUsers.fullName), asc(staffTasks.createdAt));
  return rows.map(({ task, fullName, position, roomNumber }) => taskRecord(task, { full_name: fullName, position, room_number: roomNumber }));
}

export async function listMyStaffTasks(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.view_own_tasks", "staff_tasks.my_tasks", now);
  const [membership] = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(eq(hotelUsers.hotelId, hotelId), eq(hotelUsers.userId, caller.userId))).limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Hotel access denied." });
  const rows = await db.select({ task: staffTasks, fullName: sql<string | null>`coalesce(${hotelUsers.fullName}, ${user.name})`, position: hotelUsers.position, roomNumber: rooms.roomNumber })
    .from(staffTasks).innerJoin(hotelUsers, eq(staffTasks.assignedTo, hotelUsers.id)).leftJoin(user, eq(user.id, hotelUsers.userId)).leftJoin(rooms, eq(rooms.id, staffTasks.roomId))
    .where(and(eq(staffTasks.hotelId, hotelId), eq(staffTasks.assignedTo, membership.id))).orderBy(asc(staffTasks.taskDate), asc(staffTasks.createdAt));
  const shifts = await db.select({ date: staffShifts.date, startTime: staffShifts.startTime }).from(staffShifts).where(and(eq(staffShifts.hotelId, hotelId), eq(staffShifts.hotelUserId, membership.id)));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const todaysShifts = shifts.filter(shift => shift.date === today).map(shift => ({ start_time: shift.startTime }));
  const waiting = getStaffTaskWaitingState(todaysShifts, now);
  const tasks = rows.filter(({ task }) => isStaffTaskVisibleToAssignee({ task_date: task.taskDate, status: task.status as "pending" | "done" }, shifts.filter(shift => shift.date === task.taskDate).map(shift => ({ start_time: shift.startTime })), now))
    .map(({ task, fullName, position, roomNumber }) => taskRecord(task, { full_name: fullName, position, room_number: roomNumber }));
  return { tasks, ...waiting };
}

export async function createStaffTask(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, input: StaffTaskInput, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_tasks", "staff_tasks.create", now);
  await ensureMembership(db, hotelId, input.assigned_to); await ensureRoom(db, hotelId, input.room_id);
  const [row] = await db.insert(staffTasks).values({ hotelId, assignedTo: input.assigned_to, taskDate: input.task_date, title: input.title.trim(), details: input.details?.trim() || null, roomId: input.room_id || null, createdBy: caller.userId }).returning();
  return row;
}

export async function updateStaffTask(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, id: string, input: StaffTaskInput, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_tasks", "staff_tasks.update", now);
  await ensureMembership(db, hotelId, input.assigned_to); await ensureRoom(db, hotelId, input.room_id);
  const [row] = await db.update(staffTasks).set({ assignedTo: input.assigned_to, taskDate: input.task_date, title: input.title.trim(), details: input.details?.trim() || null, roomId: input.room_id || null }).where(and(eq(staffTasks.id, id), eq(staffTasks.hotelId, hotelId))).returning();
  return row ?? null;
}

export async function deleteStaffTask(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, id: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_tasks", "staff_tasks.delete", now);
  const [row] = await db.delete(staffTasks).where(and(eq(staffTasks.id, id), eq(staffTasks.hotelId, hotelId))).returning({ id: staffTasks.id }); return row ?? null;
}

export async function setStaffTaskDone(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, id: string, done: boolean, now = new Date()) {
  let manager = true;
  try { await authorizeHotelAction(db, caller, hotelId, "staff.manage_tasks", "staff_tasks.complete", now); }
  catch (error) {
    if (!(error instanceof TRPCError) || error.code !== "FORBIDDEN") throw error;
    manager = false;
    await authorizeHotelAction(db, caller, hotelId, "staff.view_own_tasks", "staff_tasks.complete_own", now);
  }
  const [row] = await db.select().from(staffTasks).where(and(eq(staffTasks.id, id), eq(staffTasks.hotelId, hotelId))).limit(1);
  if (!row) return null;
  const own = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(eq(hotelUsers.id, row.assignedTo), eq(hotelUsers.hotelId, hotelId), eq(hotelUsers.userId, caller.userId))).limit(1);
  if (!manager && !own.length) throw new TRPCError({ code: "FORBIDDEN", message: "Hotel access denied." });
  if (!manager) {
    const shifts = await db.select({ startTime: staffShifts.startTime }).from(staffShifts).where(and(eq(staffShifts.hotelId, hotelId), eq(staffShifts.hotelUserId, row.assignedTo), eq(staffShifts.date, row.taskDate)));
    if (!isStaffTaskVisibleToAssignee({ task_date: row.taskDate, status: row.status as "pending" | "done" }, shifts.map(s => ({ start_time: s.startTime })), now)) throw new TRPCError({ code: "FORBIDDEN", message: "Task is not visible yet." });
  }
  const [updated] = await db.update(staffTasks).set({ status: done ? "done" : "pending", completedAt: done ? now : null, completedBy: done ? caller.userId : null }).where(and(eq(staffTasks.id, id), eq(staffTasks.hotelId, hotelId))).returning();
  return updated ?? null;
}
