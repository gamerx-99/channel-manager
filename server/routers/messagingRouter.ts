import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import {
  createMessageThread as dbCreateMessageThread,
  listThreads as dbListThreads,
  createMessage as dbCreateMessage,
  listMessages as dbListMessages,
} from '../d1/messaging';
import {
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();

export const listThreadsSchema = z.object({
  hotel_id: hotelIdSchema,
  booking_id: z.string().uuid().optional(),
});

export const createThreadSchema = z.object({
  hotel_id: hotelIdSchema,
  booking_id: z.string().uuid().nullable().optional(),
});

export const listMessagesSchema = z.object({
  hotel_id: hotelIdSchema,
  thread_id: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  hotel_id: hotelIdSchema,
  thread_id: z.string().uuid(),
  body: z.string().trim().min(1, 'Message body is required.').max(4000),
});

export const listThreads = protectedProcedure
  .input(listThreadsSchema)
  .query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbListThreads(ctx.db, ctx.caller ?? { userId: ctx.user.id }, { hotel_id: input.hotel_id, booking_id: input.booking_id });
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const createThread = protectedProcedure
  .input(createThreadSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbCreateMessageThread(ctx.db, ctx.caller ?? { userId: ctx.user.id }, { hotel_id: input.hotel_id, booking_id: input.booking_id });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return rethrowDomainError(error);
    }
  });

export const listMessages = protectedProcedure
  .input(listMessagesSchema)
  .query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbListMessages(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.thread_id);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return rethrowDomainError(error);
    }
  });

export const sendMessage = protectedProcedure
  .input(sendMessageSchema)
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await dbCreateMessage(ctx.db, ctx.caller ?? { userId: ctx.user.id }, { hotel_id: input.hotel_id, thread_id: input.thread_id, body: input.body });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return rethrowDomainError(error);
    }
  });

export const messagingRouter = router({
  listThreads,
  createThread,
  listMessages,
  sendMessage,
});
