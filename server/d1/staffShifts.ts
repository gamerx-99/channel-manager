import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { hotelUsers, staffShifts } from "../../drizzle/d1-schema";
import { user } from "../../drizzle/auth-schema";
import { TRPCError } from "@trpc/server";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export type StaffShiftInput = { hotel_user_id: string; date: string; start_time: string; end_time: string; break_minutes: number };

export async function listStaffShifts(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, month: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.view_shifts", "staff_shifts.list", now);
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const [members, rows] = await Promise.all([
    db.select({ id: hotelUsers.id, full_name: sql<string | null>`coalesce(${hotelUsers.fullName}, ${user.name})`, email: user.email, position: hotelUsers.position, role: hotelUsers.role }).from(hotelUsers).leftJoin(user, eq(user.id, hotelUsers.userId)).where(and(eq(hotelUsers.hotelId, hotelId), sql`${hotelUsers.role} <> 'hotel_owner'`)).orderBy(asc(hotelUsers.fullName), asc(user.name)),
    db.select().from(staffShifts).where(and(eq(staffShifts.hotelId, hotelId), gte(staffShifts.date, start), lt(staffShifts.date, end))).orderBy(asc(staffShifts.date)),
  ]);
  const shifts = rows.map(row => ({ id: row.id, hotel_user_id: row.hotelUserId, date: row.date, start_time: row.startTime, end_time: row.endTime, break_minutes: row.breakMinutes }));
  return { members, shifts };
}

export async function updateStaffShiftMember(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, membershipId: string, fullName: string | null, position: string | null, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_shifts", "staff_shifts.update_member", now);
  await ensureMembership(db, hotelId, membershipId);
  const [row] = await db.update(hotelUsers).set({ fullName, position }).where(and(eq(hotelUsers.id, membershipId), eq(hotelUsers.hotelId, hotelId), sql`${hotelUsers.role} <> 'hotel_owner'`)).returning({ id: hotelUsers.id });
  return row ?? null;
}

async function ensureMembership(db: D1ScopedDatabase, hotelId: string, membershipId: string) {
  const [member] = await db.select({ id: hotelUsers.id, role: hotelUsers.role }).from(hotelUsers).where(and(eq(hotelUsers.id, membershipId), eq(hotelUsers.hotelId, hotelId), sql`${hotelUsers.role} <> 'hotel_owner'`)).limit(1);
  if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "Staff member not found in this hotel." });
  return member;
}

export async function addStaffShift(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, input: StaffShiftInput, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_shifts", "staff_shifts.add", now);
  await ensureMembership(db, hotelId, input.hotel_user_id);
  const [row] = await db.insert(staffShifts).values({ hotelUserId: input.hotel_user_id, date: input.date, startTime: input.start_time, endTime: input.end_time, breakMinutes: input.break_minutes, hotelId, createdBy: caller.userId }).returning();
  return row;
}

export async function editStaffShift(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, id: string, input: StaffShiftInput, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_shifts", "staff_shifts.edit", now);
  await ensureMembership(db, hotelId, input.hotel_user_id);
  const [row] = await db.update(staffShifts).set({ hotelUserId: input.hotel_user_id, date: input.date, startTime: input.start_time, endTime: input.end_time, breakMinutes: input.break_minutes, updatedAt: now }).where(and(eq(staffShifts.id, id), eq(staffShifts.hotelId, hotelId))).returning();
  return row ?? null;
}

export async function deleteStaffShift(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, id: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "staff.manage_shifts", "staff_shifts.delete", now);
  const [row] = await db.delete(staffShifts).where(and(eq(staffShifts.id, id), eq(staffShifts.hotelId, hotelId))).returning({ id: staffShifts.id });
  return row ?? null;
}
