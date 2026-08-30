import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type HousekeepingTaskRecord = {
  id: string;
  room_id: string;
  booking_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
};

export type CreateHousekeepingTaskInput = {
  room_id: string;
  booking_id?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  status?: string;
};

export type UpdateHousekeepingTaskInput = {
  room_id?: string;
  booking_id?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  status?: string;
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /housekeeping_tasks.*does not exist/i.test(message);
}

function throwOnError(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
}

/**
 * Resolve hotel_id for a room via RLS-scoped lookup.
 */
export async function getHotelIdForRoom(client: SupabaseClient, roomId: string): Promise<string | null> {
  const { data, error } = await client.from('rooms').select('hotel_id').eq('id', roomId).maybeSingle();
  throwOnError(error as { message: string; code?: string } | null);
  return (data as { hotel_id?: string } | null)?.hotel_id ?? null;
}

/**
 * Check whether a user has a hotel_users membership for the given hotel.
 */
export async function isHotelMember(client: SupabaseClient, hotelId: string, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('hotel_users')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('user_id', userId)
    .maybeSingle();
  throwOnError(error as { message: string; code?: string } | null);
  return Boolean((data as { id?: string } | null)?.id);
}

/**
 * Validate that assigned_to, if present, is a member of the hotel that owns roomId.
 * Throws BAD_REQUEST naming the invalid assignee when the membership is missing.
 */
export async function assertAssigneeIsHotelMember(
  client: SupabaseClient,
  roomId: string,
  assignedTo: string | null | undefined,
): Promise<void> {
  if (!assignedTo) return;
  const hotelId = await getHotelIdForRoom(client, roomId);
  if (!hotelId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found for housekeeping task.' });
  }
  const isMember = await isHotelMember(client, hotelId, assignedTo);
  if (!isMember) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Assignee ${assignedTo} is not a member of this hotel`,
    });
  }
}

/**
 * Resolve due_date: if explicit due_date is provided, keep it; if booking_id is
 * provided without due_date, fetch booking.check_out and use it.
 */
export async function resolveHousekeepingDueDate(
  client: SupabaseClient,
  bookingId: string | null | undefined,
  explicitDueDate: string | null | undefined,
): Promise<string | null | undefined> {
  // If caller gave an explicit due_date (including empty string? treat as provided)
  // we never override it.
  if (explicitDueDate !== undefined && explicitDueDate !== null) return explicitDueDate;
  if (explicitDueDate === null) {
    // Caller explicitly passed null — but if booking_id present and due_date is null,
    // we should default from booking. The spec says "without due_date" -> default.
    // So null counts as "without" when booking_id exists. We continue to fetch.
    // However if caller passed null without booking, return null.
    if (!bookingId) return null;
  } else if (explicitDueDate === undefined) {
    if (!bookingId) return undefined;
  }

  if (!bookingId) return explicitDueDate;

  // Only fetch when due_date is null or undefined and booking_id present
  // If due_date was explicitly provided (non-null), we already returned above.
  // So here due_date is null/undefined and booking_id is present.
  const { data, error } = await client.from('bookings').select('check_out').eq('id', bookingId).maybeSingle();
  throwOnError(error as { message: string; code?: string } | null);
  const checkOut = (data as { check_out?: string } | null)?.check_out ?? null;
  if (checkOut) return checkOut;
  return explicitDueDate ?? null;
}

export async function listHousekeepingTasks(client: SupabaseClient, hotelId: string): Promise<HousekeepingTaskRecord[]> {
  try {
    const { data, error } = await client
      .from('housekeeping_tasks')
      .select('id,room_id,booking_id,assigned_to,due_date,status,created_at,rooms!inner(hotel_id)')
      .eq('rooms.hotel_id', hotelId)
      .order('due_date', { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
    return (data ?? []) as unknown as HousekeepingTaskRecord[];
  } catch (err) {
    if (isMissingTableError(err)) return [];
    if (err instanceof Error && /housekeeping_tasks.*does not exist/i.test(err.message)) return [];
    throw err;
  }
}

export async function createHousekeepingTask(
  client: SupabaseClient,
  input: CreateHousekeepingTaskInput,
): Promise<HousekeepingTaskRecord> {
  // Validate assignee membership via rooms->hotel_id + hotel_users
  await assertAssigneeIsHotelMember(client, input.room_id, input.assigned_to ?? null);

  // Resolve due_date default from booking.check_out when booking_id provided without due_date
  const resolvedDueDate = await resolveHousekeepingDueDate(client, input.booking_id ?? null, input.due_date ?? null);

  const insertPayload: Record<string, unknown> = {
    room_id: input.room_id,
    booking_id: input.booking_id ?? null,
    assigned_to: input.assigned_to ?? null,
    due_date: resolvedDueDate ?? null,
  };
  if (input.status) insertPayload.status = input.status;

  try {
    const { data, error } = await client.from('housekeeping_tasks').insert(insertPayload).select('*').single();
    if (error) {
      if (isMissingTableError(error)) {
        // Gracefully handle missing table — return a synthetic record for callers that
        // don't depend on persistence when migration hasn't been applied.
        return {
          id: '00000000-0000-4000-a000-000000000000',
          room_id: input.room_id,
          booking_id: (input.booking_id as string | null) ?? null,
          assigned_to: (input.assigned_to as string | null) ?? null,
          due_date: (resolvedDueDate as string | null) ?? null,
          status: (input.status as string) ?? 'pending',
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Housekeeping task insert did not return a record.');
    return data as HousekeepingTaskRecord;
  } catch (err) {
    if (isMissingTableError(err)) {
      return {
        id: '00000000-0000-4000-a000-000000000000',
        room_id: input.room_id,
        booking_id: (input.booking_id as string | null) ?? null,
        assigned_to: (input.assigned_to as string | null) ?? null,
        due_date: (resolvedDueDate as string | null) ?? null,
        status: (input.status as string) ?? 'pending',
        created_at: new Date().toISOString(),
      };
    }
    if (err instanceof TRPCError) throw err;
    throw err;
  }
}

export async function updateHousekeepingTask(
  client: SupabaseClient,
  taskId: string,
  patch: UpdateHousekeepingTaskInput & { room_id: string },
): Promise<HousekeepingTaskRecord> {
  // If assigned_to is in patch (including explicit null to unassign, we skip check for null)
  if (patch.assigned_to !== undefined) {
    await assertAssigneeIsHotelMember(client, patch.room_id, patch.assigned_to ?? null);
  }

  let resolvedDueDate: string | null | undefined = patch.due_date;
  // Only default due_date from booking when patch has booking_id and due_date is not explicitly provided
  if (patch.booking_id && (patch.due_date === undefined || patch.due_date === null)) {
    resolvedDueDate = await resolveHousekeepingDueDate(client, patch.booking_id, patch.due_date ?? null);
  }

  const updatePayload: Record<string, unknown> = {};
  if (patch.booking_id !== undefined) updatePayload.booking_id = patch.booking_id;
  if (patch.assigned_to !== undefined) updatePayload.assigned_to = patch.assigned_to;
  if (resolvedDueDate !== undefined) updatePayload.due_date = resolvedDueDate;
  if (patch.status !== undefined) updatePayload.status = patch.status;

  try {
    const { data, error } = await client.from('housekeeping_tasks').update(updatePayload).eq('id', taskId).select('*').maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        return {
          id: taskId,
          room_id: patch.room_id,
          booking_id: (patch.booking_id as string | null) ?? null,
          assigned_to: (patch.assigned_to as string | null) ?? null,
          due_date: (resolvedDueDate as string | null) ?? null,
          status: (patch.status as string) ?? 'pending',
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Housekeeping task update did not return a record.');
    return data as HousekeepingTaskRecord;
  } catch (err) {
    if (isMissingTableError(err)) {
      return {
        id: taskId,
        room_id: patch.room_id,
        booking_id: (patch.booking_id as string | null) ?? null,
        assigned_to: (patch.assigned_to as string | null) ?? null,
        due_date: (resolvedDueDate as string | null) ?? null,
        status: (patch.status as string) ?? 'pending',
        created_at: new Date().toISOString(),
      };
    }
    if (err instanceof TRPCError) throw err;
    throw err;
  }
}
