import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { createStaffTask as dbCreate, deleteStaffTask as dbDelete, listMyStaffTasks as dbMy, listStaffTasks as dbList, setStaffTaskDone as dbSetDone, updateStaffTask as dbUpdate } from "../d1/staffTasks";
import { requireHotelPermission, rethrowDomainError } from "../routerUtils";

const hotelId = z.string().uuid();
const task = z.object({ assigned_to: z.string().uuid(), task_date: z.string().date(), title: z.string().trim().min(1).max(160), details: z.string().trim().max(2000).nullable().optional(), room_id: z.string().uuid().nullable().optional() });
const list = protectedProcedure.input(z.object({ hotel_id: hotelId, from: z.string().date(), to: z.string().date(), assigned_to: z.string().uuid().optional() })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_tasks");
  if (input.from > input.to) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date range." });
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { return await dbList(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.from, input.to, input.assigned_to); } catch (error) { return rethrowDomainError(error); }
});
const myTasks = protectedProcedure.input(z.object({ hotel_id: hotelId })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.view_own_tasks");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { return await dbMy(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id); } catch (error) { return rethrowDomainError(error); }
});
const create = protectedProcedure.input(z.object({ hotel_id: hotelId, ...task.shape })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_tasks"); if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const { hotel_id, ...data } = input; return await dbCreate(ctx.db, ctx.caller ?? { userId: ctx.user.id }, hotel_id, data); } catch (error) { return rethrowDomainError(error); }
});
const update = protectedProcedure.input(z.object({ hotel_id: hotelId, id: z.string().uuid(), ...task.shape })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_tasks"); if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const { hotel_id, id, ...data } = input; const row = await dbUpdate(ctx.db, ctx.caller ?? { userId: ctx.user.id }, hotel_id, id, data); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
const remove = protectedProcedure.input(z.object({ hotel_id: hotelId, id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_tasks"); if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const row = await dbDelete(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.id); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
const setDone = protectedProcedure.input(z.object({ hotel_id: hotelId, id: z.string().uuid(), done: z.boolean() })).mutation(async ({ ctx, input }) => {
  const manager = ctx.user.memberships?.some(m => m.hotelId === input.hotel_id && m.permissions.includes("staff.manage_tasks"));
  if (!manager) requireHotelPermission(ctx.user, input.hotel_id, "staff.view_own_tasks");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const row = await dbSetDone(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.id, input.done); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
export const staffTasksRouter = router({ list, myTasks, create, update, delete: remove, setDone });
