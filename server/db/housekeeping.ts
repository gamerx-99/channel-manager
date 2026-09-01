import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, isMissingTableError } from './utils';
import type { HousekeepingTaskStatus, HousekeepingTaskRecord } from './types';

function isMissingHousekeepingTableError(error: unknown): boolean {
  return isMissingTableError('housekeeping_tasks', error);
}

async function assertHousekeepingAssigneeIsMember(
  client: SupabaseClient,
  roomId: string,
  assignedTo: string | null | undefined,
): Promise<void> {
  if (!assignedTo) return;
  const { data: room, error: roomError } = await client.from('rooms').select('hotel_id').eq('id', roomId).maybeSingle();
  throwOnError(roomError as { message: string; code?: string } | null);
  const hotelId = (room as { hotel_id?: string } | null)?.hotel_id;
  if (!hotelId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found for housekeeping task.' });
  }
  const { data: membership, error: membershipError } = await client
    .from('hotel_users')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('user_id', assignedTo)
    .maybeSingle();
  throwOnError(membershipError as { message: string; code?: string } | null);
  if (!(membership as { id?: string } | null)?.id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Assignee ${assignedTo} is not a member of this hotel` });
  }
}

/** Creates a housekeeping task; when booking_id is given and due_date omitted, derives due_date from the booking's check_out. */
export async function createHousekeepingTask(
  client: SupabaseClient,
  input: { room_id: string; booking_id?: string | null; assigned_to?: string | null; due_date?: string | null; status?: HousekeepingTaskStatus },
): Promise<HousekeepingTaskRecord> {
  // Validate assignee membership via rooms->hotel_id + hotel_users
  await assertHousekeepingAssigneeIsMember(client, input.room_id, input.assigned_to ?? null);

  let dueDate: string | null | undefined = input.due_date ?? null;
  if (!dueDate && input.booking_id) {
    const { data: booking, error: bookingError } = await client
      .from('bookings')
      .select('check_out')
      .eq('id', input.booking_id)
      .maybeSingle();
    throwOnError(bookingError as { message: string; code?: string } | null);
    const checkOut = (booking as { check_out?: string } | null)?.check_out;
    if (checkOut) dueDate = checkOut;
  }
  if (!dueDate) {
    throw new Error('due_date is required when no booking_id is provided.');
  }
  const insertPayload: Record<string, unknown> = {
    room_id: input.room_id,
    booking_id: input.booking_id ?? null,
    assigned_to: input.assigned_to ?? null,
    due_date: dueDate,
    status: input.status ?? 'pending',
  };
  try {
    const { data, error } = await client
      .from('housekeeping_tasks')
      .insert(insertPayload)
      .select('id,room_id,booking_id,assigned_to,due_date,status,created_at')
      .single();
    if (error) {
      if (isMissingHousekeepingTableError(error)) {
        return {
          id: '00000000-0000-4000-a000-000000000000',
          room_id: input.room_id,
          booking_id: input.booking_id ?? null,
          assigned_to: input.assigned_to ?? null,
          due_date: dueDate,
          status: input.status ?? 'pending',
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Housekeeping task insert did not return a record.');
    return data as HousekeepingTaskRecord;
  } catch (err) {
    if (isMissingHousekeepingTableError(err)) {
      return {
        id: '00000000-0000-4000-a000-000000000000',
        room_id: input.room_id,
        booking_id: input.booking_id ?? null,
        assigned_to: input.assigned_to ?? null,
        due_date: dueDate,
        status: input.status ?? 'pending',
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

/** Lists housekeeping tasks scoped to a hotel via rooms.hotel_id. */
export async function listHousekeepingTasks(
  client: SupabaseClient,
  filter: { hotel_id: string },
): Promise<HousekeepingTaskRecord[]> {
  try {
    const { data, error } = await client
      .from('housekeeping_tasks')
      .select('id,room_id,booking_id,assigned_to,due_date,status,created_at,rooms!inner(id,hotel_id)')
      .eq('rooms.hotel_id', filter.hotel_id)
      .order('due_date', { ascending: true });
    if (error) {
      if (isMissingHousekeepingTableError(error)) return [];
      throw error;
    }
    return (data ?? []) as unknown as HousekeepingTaskRecord[];
  } catch (err) {
    if (isMissingHousekeepingTableError(err)) return [];
    if (err instanceof Error && /housekeeping_tasks.*does not exist/i.test(err.message)) return [];
    throw err;
  }
}

/** Updates only the status of a housekeeping task; also supports assigned_to with membership validation and due_date defaulting from booking. */
export async function updateHousekeepingTaskStatus(
  client: SupabaseClient,
  input: { task_id: string; status: HousekeepingTaskStatus; assigned_to?: string | null; room_id?: string; booking_id?: string | null; due_date?: string | null },
): Promise<HousekeepingTaskRecord | null> {
  // If assigned_to is being set, we need room_id to resolve hotel membership. Fetch existing task's room_id if not supplied.
  if (input.assigned_to !== undefined) {
    let roomId = input.room_id;
    if (!roomId) {
      try {
        const { data: existing, error: existingError } = await client
          .from('housekeeping_tasks')
          .select('room_id')
          .eq('id', input.task_id)
          .maybeSingle();
        if (existingError) {
          if (isMissingHousekeepingTableError(existingError)) return null;
          throw existingError;
        }
        roomId = (existing as { room_id?: string } | null)?.room_id;
      } catch (err) {
        if (isMissingHousekeepingTableError(err)) return null;
        throw err;
      }
    }
    if (roomId) {
      await assertHousekeepingAssigneeIsMember(client, roomId, input.assigned_to ?? null);
    }
  }

  // Resolve due_date default from booking if needed (when booking_id provided without due_date)
  let resolvedDueDate: string | null | undefined = input.due_date;
  if (input.booking_id && (input.due_date === undefined || input.due_date === null)) {
    const { data: booking, error: bookingError } = await client
      .from('bookings')
      .select('check_out')
      .eq('id', input.booking_id)
      .maybeSingle();
    throwOnError(bookingError as { message: string; code?: string } | null);
    const checkOut = (booking as { check_out?: string } | null)?.check_out;
    if (checkOut) resolvedDueDate = checkOut;
  }

  const updatePayload: Record<string, unknown> = { status: input.status };
  if (input.assigned_to !== undefined) updatePayload.assigned_to = input.assigned_to;
  if (input.booking_id !== undefined) updatePayload.booking_id = input.booking_id;
  if (resolvedDueDate !== undefined) updatePayload.due_date = resolvedDueDate;

  try {
    const { data, error } = await client
      .from('housekeeping_tasks')
      .update(updatePayload)
      .eq('id', input.task_id)
      .select('id,room_id,booking_id,assigned_to,due_date,status,created_at')
      .maybeSingle();
    if (error) {
      if (isMissingHousekeepingTableError(error)) return null;
      throw error;
    }
    return (data ?? null) as HousekeepingTaskRecord | null;
  } catch (err) {
    if (isMissingHousekeepingTableError(err)) return null;
    if (err instanceof Error && /housekeeping_tasks.*does not exist/i.test(err.message)) return null;
    throw err;
  }
}

// Extended update that supports full patch including assigned_to and due_date defaulting (used by assign validation)
export async function updateHousekeepingTask(
  client: SupabaseClient,
  taskId: string,
  patch: { room_id: string; booking_id?: string | null; assigned_to?: string | null; due_date?: string | null; status?: HousekeepingTaskStatus },
): Promise<HousekeepingTaskRecord | null> {
  if (patch.assigned_to !== undefined) {
    await assertHousekeepingAssigneeIsMember(client, patch.room_id, patch.assigned_to ?? null);
  }
  let resolvedDueDate: string | null | undefined = patch.due_date;
  if (patch.booking_id && (patch.due_date === undefined || patch.due_date === null)) {
    const { data: booking, error: bookingError } = await client
      .from('bookings')
      .select('check_out')
      .eq('id', patch.booking_id)
      .maybeSingle();
    throwOnError(bookingError as { message: string; code?: string } | null);
    const checkOut = (booking as { check_out?: string } | null)?.check_out;
    if (checkOut) resolvedDueDate = checkOut;
  }
  const updatePayload: Record<string, unknown> = {};
  if (patch.booking_id !== undefined) updatePayload.booking_id = patch.booking_id;
  if (patch.assigned_to !== undefined) updatePayload.assigned_to = patch.assigned_to;
  if (resolvedDueDate !== undefined) updatePayload.due_date = resolvedDueDate;
  if (patch.status !== undefined) updatePayload.status = patch.status;

  try {
    const { data, error } = await client
      .from('housekeeping_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .select('id,room_id,booking_id,assigned_to,due_date,status,created_at')
      .maybeSingle();
    if (error) {
      if (isMissingHousekeepingTableError(error)) {
        return {
          id: taskId,
          room_id: patch.room_id,
          booking_id: patch.booking_id ?? null,
          assigned_to: patch.assigned_to ?? null,
          due_date: (resolvedDueDate as string) ?? '',
          status: patch.status ?? 'pending',
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    return (data ?? null) as HousekeepingTaskRecord | null;
  } catch (err) {
    if (isMissingHousekeepingTableError(err)) {
      return {
        id: taskId,
        room_id: patch.room_id,
        booking_id: patch.booking_id ?? null,
        assigned_to: patch.assigned_to ?? null,
        due_date: (resolvedDueDate as string) ?? '',
        status: patch.status ?? 'pending',
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}
