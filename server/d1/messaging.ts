import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { bookings, messageThreads, messages } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

async function requireThread(db: D1ScopedDatabase, hotelId: string, threadId: string) {
  const [thread] = await db.select().from(messageThreads).where(and(
    eq(messageThreads.id, threadId), eq(messageThreads.hotelId, hotelId),
  )).limit(1);
  if (!thread) throw new TRPCError({ code: "FORBIDDEN", message: "This thread is not available to your account." });
  if (thread.bookingId) {
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.id, thread.bookingId), eq(bookings.hotelId, hotelId),
    )).limit(1);
    if (!booking) throw new TRPCError({ code: "FORBIDDEN", message: "Booking does not belong to this hotel." });
  }
  return thread;
}

export async function createMessageThread(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; booking_id?: string | null },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_bookings", "messaging.thread.create", now);
  if (input.booking_id) {
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id),
    )).limit(1);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found for message thread." });
  }
  const [thread] = await db.insert(messageThreads).values({ hotelId: input.hotel_id, bookingId: input.booking_id ?? null }).returning();
  return thread;
}

export async function listThreads(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  filter: { hotel_id: string; booking_id?: string },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, filter.hotel_id, "operations.view_bookings", "messaging.threads.list", now);
  return db.select().from(messageThreads).where(and(
    eq(messageThreads.hotelId, filter.hotel_id),
    filter.booking_id ? eq(messageThreads.bookingId, filter.booking_id) : undefined,
  )).orderBy(asc(messageThreads.createdAt));
}

export async function createMessage(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; thread_id: string; body: string },
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_bookings", "messaging.message.create", now);
  await requireThread(db, input.hotel_id, input.thread_id);
  const body = input.body.trim();
  if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Message body is required." });
  if (body.length > 4000) throw new TRPCError({ code: "BAD_REQUEST", message: "Message body must be 4000 characters or fewer." });
  const id = crypto.randomUUID();
  await db.run(sql`insert into messages (id, thread_id, sender_user_id, body)
    select ${id}, ${input.thread_id}, ${caller.userId}, ${body}
    where exists (select 1 from message_threads where id = ${input.thread_id} and hotel_id = ${input.hotel_id})`);
  const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!message) throw new TRPCError({ code: "FORBIDDEN", message: "This thread is not available to your account." });
  return message;
}

export async function listMessages(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  threadId: string,
  now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "operations.view_bookings", "messaging.messages.list", now);
  await requireThread(db, hotelId, threadId);
  return db.select({ message: messages }).from(messages).innerJoin(messageThreads, eq(messages.threadId, messageThreads.id))
    .where(and(eq(messages.threadId, threadId), eq(messageThreads.hotelId, hotelId)))
    .orderBy(asc(messages.createdAt)).then(rows => rows.map(row => row.message));
}
