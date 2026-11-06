import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { addStaffShift as dbAdd, deleteStaffShift as dbDelete, editStaffShift as dbEdit, listStaffShifts as dbList, updateStaffShiftMember as dbUpdateMember } from "../d1/staffShifts";
import { requireHotelPermission, rethrowDomainError } from "../routerUtils";

const hotelId = z.string().uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const shift = z.object({ hotel_user_id: z.string().uuid(), date: z.string().date(), start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), break_minutes: z.number().int().min(0) });

const list = protectedProcedure.input(z.object({ hotel_id: hotelId, month })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.view_shifts");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { return await dbList(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.month); } catch (error) { return rethrowDomainError(error); }
});
const add = protectedProcedure.input(z.object({ hotel_id: hotelId, ...shift.shape })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_shifts");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const { hotel_id, ...data } = input; return await dbAdd(ctx.db, ctx.caller ?? { userId: ctx.user.id }, hotel_id, data); } catch (error) { return rethrowDomainError(error); }
});
const edit = protectedProcedure.input(z.object({ hotel_id: hotelId, id: z.string().uuid(), ...shift.shape })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_shifts");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const { hotel_id, id, ...data } = input; const row = await dbEdit(ctx.db, ctx.caller ?? { userId: ctx.user.id }, hotel_id, id, data); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Shift not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
const remove = protectedProcedure.input(z.object({ hotel_id: hotelId, id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_shifts");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const row = await dbDelete(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.id); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Shift not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
const updateMember = protectedProcedure.input(z.object({ hotel_id: hotelId, hotel_user_id: z.string().uuid(), full_name: z.string().trim().max(160).nullable(), position: z.string().trim().max(120).nullable() })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, "staff.manage_shifts");
  if (!ctx.db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "D1 database required." });
  try { const row = await dbUpdateMember(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.hotel_user_id, input.full_name || null, input.position || null); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." }); return row; } catch (error) { return rethrowDomainError(error); }
});
export const staffShiftsRouter = router({ list, add, edit, delete: remove, updateMember });
