import { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { MessageThreadRecord, MessageRecord } from './types';
import { isMissingTableError, throwOnError } from './utils';

function isMissingMessagingTableError(error: unknown): boolean {
  return isMissingTableError(/message_threads|messages.*does not exist/i, error);
}

export async function createMessageThread(
  client: SupabaseClient,
  input: { hotel_id: string; booking_id?: string | null },
): Promise<MessageThreadRecord> {
  // If a booking is linked, ensure its hotel matches the thread's hotel to prevent cross-hotel threads.
  if (input.booking_id) {
    const { data: booking, error: bookingError } = await client
      .from('bookings')
      .select('hotel_id')
      .eq('id', input.booking_id)
      .maybeSingle();
    throwOnError(bookingError as { message: string; code?: string } | null);
    const bookingHotelId = (booking as { hotel_id?: string } | null)?.hotel_id;
    if (bookingHotelId && bookingHotelId !== input.hotel_id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Booking does not belong to this hotel.' });
    }
    if (!bookingHotelId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found for message thread.' });
    }
  }
  try {
    const { data, error } = await client
      .from('message_threads')
      .insert({ hotel_id: input.hotel_id, booking_id: input.booking_id ?? null })
      .select('id,hotel_id,booking_id,created_at')
      .single();
    if (error) {
      if (isMissingMessagingTableError(error)) {
        return {
          id: '00000000-0000-4000-a000-000000000000',
          hotel_id: input.hotel_id,
          booking_id: input.booking_id ?? null,
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Message thread insert did not return a record.');
    return data as MessageThreadRecord;
  } catch (err) {
    if (isMissingMessagingTableError(err)) {
      return {
        id: '00000000-0000-4000-a000-000000000000',
        hotel_id: input.hotel_id,
        booking_id: input.booking_id ?? null,
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

export async function listThreads(
  client: SupabaseClient,
  filter: { hotel_id: string; booking_id?: string },
): Promise<MessageThreadRecord[]> {
  try {
    let query = client
      .from('message_threads')
      .select('id,hotel_id,booking_id,created_at')
      .eq('hotel_id', filter.hotel_id)
      .order('created_at', { ascending: true });
    if (filter.booking_id) {
      query = query.eq('booking_id', filter.booking_id);
    }
    const { data, error } = await query;
    if (error) {
      if (isMissingMessagingTableError(error)) return [];
      throw error;
    }
    return (data ?? []) as MessageThreadRecord[];
  } catch (err) {
    if (isMissingMessagingTableError(err)) return [];
    if (err instanceof Error && /message_threads.*does not exist/i.test(err.message)) return [];
    throw err;
  }
}

export async function createMessage(
  client: SupabaseClient,
  input: { thread_id: string; sender_user_id?: string | null; body: string },
): Promise<MessageRecord> {
  if (!input.body || !input.body.trim()) {
    throw new Error('Message body is required.');
  }
  try {
    const { data, error } = await client
      .from('messages')
      .insert({ thread_id: input.thread_id, sender_user_id: input.sender_user_id ?? null, body: input.body })
      .select('id,thread_id,sender_user_id,body,created_at')
      .single();
    if (error) {
      if (isMissingMessagingTableError(error)) {
        return {
          id: '00000000-0000-4000-a000-000000000001',
          thread_id: input.thread_id,
          sender_user_id: input.sender_user_id ?? null,
          body: input.body,
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Message insert did not return a record.');
    return data as MessageRecord;
  } catch (err) {
    if (isMissingMessagingTableError(err)) {
      return {
        id: '00000000-0000-4000-a000-000000000001',
        thread_id: input.thread_id,
        sender_user_id: input.sender_user_id ?? null,
        body: input.body,
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

export async function listMessages(
  client: SupabaseClient,
  threadId: string,
): Promise<MessageRecord[]> {
  try {
    const { data, error } = await client
      .from('messages')
      .select('id,thread_id,sender_user_id,body,created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) {
      if (isMissingMessagingTableError(error)) return [];
      throw error;
    }
    return (data ?? []) as MessageRecord[];
  } catch (err) {
    if (isMissingMessagingTableError(err)) return [];
    if (err instanceof Error && /messages.*does not exist/i.test(err.message)) return [];
    throw err;
  }
}
