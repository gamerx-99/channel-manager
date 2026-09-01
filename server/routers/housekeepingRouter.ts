import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import {
  createHousekeepingTask as dbCreateHousekeepingTask,
  listHousekeepingTasks as dbListHousekeepingTasks,
  updateHousekeepingTaskStatus as dbUpdateHousekeepingTaskStatus,
} from '../db';
import {
  requireHotelPermission,
  assertHotelExists,
  rethrowDomainError,
  rlsClient,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const housekeepingTaskStatusSchema = z.enum(['pending', 'in_progress', 'done']);

export const createHousekeepingTaskSchema = z.object({
  hotel_id: hotelIdSchema,
  room_id: z.string().uuid(),
  booking_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  status: housekeepingTaskStatusSchema.default('pending'),
});

export const listHousekeepingTasksSchema = z.object({
  hotel_id: hotelIdSchema,
});

export const updateHousekeepingTaskStatusSchema = z.object({
  hotel_id: hotelIdSchema,
  task_id: z.string().uuid(),
  status: housekeepingTaskStatusSchema,
  assigned_to: z.string().uuid().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
});

export const createHousekeepingTask = protectedProcedure
  .input(createHousekeepingTaskSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.update_room_status');
    // due_date required when no booking — db helper derives it from booking.check_out when booking_id provided
    if (!input.due_date && !input.booking_id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'due_date is required when no booking is linked.' });
    }
    const client = rlsClient(ctx.user.accessToken);
    try {
      await assertHotelExists(client, input.hotel_id);
      // Assignee membership validation and booking due_date derivation are handled by createHousekeepingTask in db.ts
      return await dbCreateHousekeepingTask(client, {
        room_id: input.room_id,
        booking_id: input.booking_id ?? null,
        assigned_to: input.assigned_to ?? null,
        due_date: input.due_date ?? null,
        status: input.status,
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const listHousekeepingTasks = protectedProcedure
  .input(listHousekeepingTasksSchema)
  .query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.view_room_status');
    try {
      // 42P01 graceful handling (missing migration) is done inside listHousekeepingTasks in db.ts
      return await dbListHousekeepingTasks(rlsClient(ctx.user.accessToken), { hotel_id: input.hotel_id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const updateHousekeepingTaskStatus = protectedProcedure
  .input(updateHousekeepingTaskStatusSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'housekeeping.update_room_status');
    const client = rlsClient(ctx.user.accessToken);
    try {
      await assertHotelExists(client, input.hotel_id);
      // Assignee membership validation, booking due_date derivation, and 42P01 handling are all in updateHousekeepingTaskStatus in db.ts
      const updated = await dbUpdateHousekeepingTaskStatus(client, {
        task_id: input.task_id,
        status: input.status,
        assigned_to: input.assigned_to,
        booking_id: input.booking_id ?? undefined,
        due_date: input.due_date,
      });
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This housekeeping task was not found.' });
      }
      return updated;
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const housekeepingRouter = router({
  createTask: createHousekeepingTask,
  listTasks: listHousekeepingTasks,
  updateTaskStatus: updateHousekeepingTaskStatus,
});
