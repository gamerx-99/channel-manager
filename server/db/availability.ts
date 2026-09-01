import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError, throwOnError } from './utils';
import type { AvailabilityRecord, RateOverrideRecord } from './types';

export async function listAvailabilityForHotel(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('availability')
    .select('id,room_type_id,date,price,rooms_available,room_types!inner(id,hotel_id,name)')
    .eq('room_types.hotel_id', hotelId)
    .order('date', { ascending: true });
  throwOnError(error);
  return (data ?? []).map(row => ({
    ...row,
    room_types: Array.isArray(row.room_types) ? row.room_types[0] : row.room_types,
  })) as unknown as AvailabilityRecord[];
}

export async function updateAvailability(
  client: SupabaseClient,
  input: Pick<AvailabilityRecord, 'room_type_id' | 'date' | 'price' | 'rooms_available'>,
) {
  const { data, error } = await client
    .from('availability')
    .upsert(input, { onConflict: 'room_type_id,date' })
    .select('id,room_type_id,date,price,rooms_available')
    .single();
  throwOnError(error);
  return data;
}

/** Returns all rate overrides for a room type (RLS-scoped). Gracefully returns [] if table not yet migrated. */
export async function listRateOverridesForRoomType(
  client: SupabaseClient,
  roomTypeId: string,
): Promise<RateOverrideRecord[]> {
  try {
    const { data, error } = await client
      .from('rate_overrides')
      .select('id,room_type_id,start_date,end_date,override_price,min_stay_nights,created_at')
      .eq('room_type_id', roomTypeId)
      .order('start_date', { ascending: true });
    if (error) {
      // 42P01 = undefined_table (Postgres), PGRST205 = schema-cache miss (PostgREST).
      // Either means the rate_overrides migration hasn't been applied yet — treat as no overrides.
      if (isMissingTableError('rate_overrides', error)) return [];
      throw error;
    }
    return (data ?? []) as RateOverrideRecord[];
  } catch (err) {
    if (isMissingTableError('rate_overrides', err)) return [];
    throw err;
  }
}

/** Resolves the required min stay for a booking range against its room type's overrides and throws BAD_REQUEST if violated. */
export async function assertBookingMinStay(
  client: SupabaseClient,
  roomId: string | null,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  if (!roomId) return; // unassigned room — no room type to check
  // Resolve room_type_id via rooms lookup (RLS-scoped)
  const { data: room, error: roomError } = await client
    .from('rooms')
    .select('room_type_id')
    .eq('id', roomId)
    .maybeSingle();
  throwOnError(roomError);
  const roomTypeId = (room as { room_type_id?: string } | null)?.room_type_id;
  if (!roomTypeId) return;
  const overrides = await listRateOverridesForRoomType(client, roomTypeId);
  if (!overrides.length) return;
  // Inline min-stay check to keep db.ts free of pricing.ts runtime import cycles at type level,
  // but share the same logic (max min_stay among overlapping ranges).
  let required: number | null = null;
  for (const o of overrides) {
    if (o.min_stay_nights == null) continue;
    if (o.start_date < checkOut && o.end_date >= checkIn) {
      if (required == null || o.min_stay_nights > required) required = o.min_stay_nights;
    }
  }
  if (required == null) return;
  const nights = Math.round(
    (Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / 86_400_000,
  );
  if (nights < required) {
    throw new Error(
      `Booking must be at least ${required} night${required === 1 ? '' : 's'} (minimum stay for selected dates is ${required} night${required === 1 ? '' : 's'}).`,
    );
  }
}

export async function listRateOverrides(
  client: SupabaseClient,
  filter: { hotel_id: string; room_type_id?: string },
) {
  let query = client
    .from('rate_overrides')
    .select('id,room_type_id,start_date,end_date,override_price,min_stay_nights,created_at,room_types!inner(id,hotel_id)')
    .eq('room_types.hotel_id', filter.hotel_id)
    .order('start_date', { ascending: true });
  if (filter.room_type_id) {
    query = query.eq('room_type_id', filter.room_type_id);
  }
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as unknown as RateOverrideRecord[];
}

export async function createRateOverride(
  client: SupabaseClient,
  input: Omit<RateOverrideRecord, 'id' | 'created_at'>,
) {
  // Application-level overlap guard so the error message is specific before
  // the database EXCLUDE constraint fires (23P01).
  const { data: overlapping, error: overlapError } = await client
    .from('rate_overrides')
    .select('id')
    .eq('room_type_id', input.room_type_id)
    .lte('start_date', input.end_date)
    .gte('end_date', input.start_date)
    .limit(1);
  throwOnError(overlapError);
  if (overlapping && overlapping.length > 0) {
    throw new Error('23P01: This room type already has a rate override overlapping the selected dates.');
  }
  const { data, error } = await client
    .from('rate_overrides')
    .insert(input)
    .select('id,room_type_id,start_date,end_date,override_price,min_stay_nights,created_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Rate override insert did not return a record.');
  return data as RateOverrideRecord;
}

export async function deleteRateOverride(
  client: SupabaseClient,
  rateOverrideId: string,
) {
  const { data, error } = await client
    .from('rate_overrides')
    .delete()
    .eq('id', rateOverrideId)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}
