import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HumanRole } from '@shared/authorization';
import { resolveEffectiveRate, getRequiredMinStayNights } from './pricing';

export type HotelRecord = {
  id: string;
  name: string;
  slug: string;
  address: string;
  public_enabled: boolean;
  created_at: string;
};

export type RoomTypeRecord = {
  id: string;
  hotel_id: string;
  name: string;
  capacity: number;
  base_price: number | string;
};

export type CreateHotelInput = Pick<HotelRecord, 'name' | 'slug' | 'address' | 'public_enabled'> & {
  owner_contact: string;
};

export type CreateRoomTypeInput = Pick<RoomTypeRecord, 'hotel_id' | 'name' | 'capacity' | 'base_price'> & { quantity: number };

export type UpdateRoomTypeInput = Omit<CreateRoomTypeInput, 'quantity'> & { room_type_id: string };
export type DeleteRoomTypeInput = Pick<UpdateRoomTypeInput, 'hotel_id' | 'room_type_id'>;

export type GuestRecord = {
  id: string;
  booking_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: 'M' | 'F' | null;
  passport_no: string;
  nationality_code: string;
  birth_date: string;
  phone_no: string | null;
};

export type BookingRecord = {
  id: string;
  hotel_id: string;
  room_id: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
  price: number | string;
  source: 'manual' | 'walk-in' | 'phone';
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  created_at: string;
  rooms: { room_number: string; room_types: { name: string } | null } | null;
  guests: GuestRecord[];
};

export type AvailabilityRecord = {
  id: string;
  room_type_id: string;
  date: string;
  price: number | string;
  rooms_available: number;
  room_types: { id: string; hotel_id: string; name: string };
};

function throwOnError(error: { message: string; code?: string } | null) {
  if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
}

/**
 * Compatibility surface for the unused template OAuth SDK. Channel Manager
 * authentication is now Supabase Auth; no user record is read from or written
 * to the template MySQL/TiDB database.
 */
type LegacyTemplateUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export async function getUserByOpenId(_openId: string): Promise<LegacyTemplateUser | undefined> {
  return undefined;
}

export async function upsertUser(_user: Partial<LegacyTemplateUser> & { openId: string }): Promise<void> {
  // Intentionally no-op: Supabase Auth owns Channel Manager identity.
}

/** Lists only hotels visible to the authenticated caller under RLS. */
export async function listManagedHotels(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotels')
    .select('id,name,slug,address,public_enabled,created_at,room_types(id),rooms(id,status),bookings(id,source,status,check_in,check_out,price)')
    .order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []) as Array<HotelRecord & {
    room_types: Array<{ id: string }>;
    rooms: Array<{ id: string; status: string }>;
    bookings: Array<{
      id: string;
      source: BookingRecord['source'];
      status: BookingRecord['status'];
      check_in: string;
      check_out: string;
      price: number | string;
    }>;
  }>;
}

/** Lists RLS-visible hotels with bookings joined to their room type name, for revenue reporting. */
export async function listManagedHotelsForFinancials(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotels')
    .select('id,bookings(id,status,check_in,check_out,price,rooms(room_types(name)))')
    .order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []) as unknown as Array<{
    id: string;
    bookings: Array<{
      id: string;
      status: BookingRecord['status'];
      check_in: string;
      check_out: string;
      price: number | string;
      rooms: { room_types: { name: string } | null } | null;
    }>;
  }>;
}

export async function getManagedHotel(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('hotels')
    .select('id,name,slug,address,public_enabled,created_at,room_types(id,hotel_id,name,capacity,base_price),rooms(id,room_type_id,room_number,status)')
    .eq('id', hotelId)
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return data as HotelRecord & {
    room_types: RoomTypeRecord[];
    rooms: Array<{ id: string; room_type_id: string; room_number: string; status: string }>;
  };
}

export async function isSuperAdmin(client: SupabaseClient) {
  const { data, error } = await client.rpc('is_super_admin');
  throwOnError(error);
  return data === true;
}

/** Inserts with the authenticated caller's JWT-scoped client; the database RLS policy remains authoritative. */
export async function createManagedHotel(client: SupabaseClient, input: CreateHotelInput) {
  const { data, error } = await client
    .from('hotels')
    .insert(input)
    .select('id,name,slug,address,public_enabled,created_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Hotel insert did not return a record.');
  return data as HotelRecord;
}

/** Inserts after the router has checked that the caller can read the target hotel under RLS. */
export async function createManagedRoomType(client: SupabaseClient, input: CreateRoomTypeInput) {
  const { quantity, ...roomTypeInput } = input;
  const { data: roomType, error: typeError } = await client
    .from('room_types')
    .insert(roomTypeInput)
    .select('id,hotel_id,name,capacity,base_price')
    .single();
  throwOnError(typeError);
  if (!roomType) throw new Error('Room type insert did not return a record.');

  const rooms = Array.from({ length: quantity }, (_, i) => ({
    hotel_id: input.hotel_id,
    room_type_id: roomType.id,
    room_number: `${String(i + 1).padStart(3, '0')}`,
  }));
  const { error: roomsError } = await client.from('rooms').insert(rooms);
  throwOnError(roomsError);

  return roomType as RoomTypeRecord;
}

/** Updates only mutable room type fields while constraining the write to the selected hotel. */
export async function updateManagedRoomType(client: SupabaseClient, input: UpdateRoomTypeInput) {
  const { data, error } = await client
    .from('room_types')
    .update({ name: input.name, capacity: input.capacity, base_price: input.base_price })
    .eq('id', input.room_type_id)
    .eq('hotel_id', input.hotel_id)
    .select('id,hotel_id,name,capacity,base_price')
    .maybeSingle();
  throwOnError(error);
  return (data ?? null) as RoomTypeRecord | null;
}

/** Deletes a room type through the authenticated caller's RLS client and hotel scope. */
export async function deleteManagedRoomType(client: SupabaseClient, input: DeleteRoomTypeInput) {
  const { data, error } = await client
    .from('room_types')
    .delete()
    .eq('id', input.room_type_id)
    .eq('hotel_id', input.hotel_id)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

export async function listBookingsForHotel(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('bookings')
    .select('id,hotel_id,room_id,guest_name,check_in,check_out,price,source,status,created_at,rooms(room_number,room_types(name)),guests(id,booking_id,first_name,middle_name,last_name,gender,passport_no,nationality_code,birth_date,phone_no)')
    .eq('hotel_id', hotelId)
    .order('check_in', { ascending: false });
  throwOnError(error);
  type JoinedBooking = Omit<BookingRecord, 'rooms'> & {
    rooms: Array<{ room_number: string; room_types: Array<{ name: string }> }>;
  };
  const joinedRows = (data ?? []) as unknown as JoinedBooking[];
  return joinedRows.map(row => {
    const room = row.rooms[0] ?? null;
    return {
      ...row,
      rooms: room
        ? { room_number: room.room_number, room_types: room.room_types[0] ?? null }
        : null,
    };
  });
}

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

export async function getPublicHotel(client: SupabaseClient, slug: string) {
  const { data, error } = await client.rpc('get_public_hotel', { target_slug: slug }).single();
  throwOnError(error);

  const hotel = data as Pick<HotelRecord, 'id' | 'name' | 'slug' | 'address' | 'created_at'>;
  const [{ data: roomTypes, error: roomTypeError }, { data: media, error: mediaError }] = await Promise.all([
    client.from('room_types').select('id,hotel_id,name,capacity,base_price').eq('hotel_id', hotel.id).order('base_price'),
    client.from('hotel_media').select('id,url,caption,is_hero,display_order').eq('hotel_id', hotel.id).order('display_order'),
  ]);
  throwOnError(roomTypeError);
  throwOnError(mediaError);
  return { hotel, roomTypes: (roomTypes ?? []) as RoomTypeRecord[], media: media ?? [] };
}

export type PublicRoomTypeAvailability = {
  id: string;
  name: string;
  capacity: number;
  base_price: number;
  total_price: number;
  avg_nightly_price: number;
  nights: number;
  rooms_available: number;
  min_stay_nights: number | null;
  is_available: boolean;
  min_stay_violated: boolean;
};

export type PublicHotelAvailabilityResult = {
  hotel: Pick<HotelRecord, 'id' | 'name' | 'slug' | 'address'>;
  check_in: string;
  check_out: string;
  nights: number;
  room_types: PublicRoomTypeAvailability[];
};

export function getStayDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return [];
  }
  const current = new Date(start);
  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export async function getPublicHotelAvailability(
  client: SupabaseClient,
  slug: string,
  checkIn: string,
  checkOut: string,
): Promise<PublicHotelAvailabilityResult> {
  const stayDates = getStayDates(checkIn, checkOut);
  if (stayDates.length === 0) {
    throw new Error('Check-out date must be after check-in date.');
  }
  const nights = stayDates.length;

  const { data: hotelData, error: hotelError } = await client.rpc('get_public_hotel', { target_slug: slug }).single();
  throwOnError(hotelError);
  if (!hotelData) throw new Error('Hotel not found or not published.');
  const hotel = hotelData as Pick<HotelRecord, 'id' | 'name' | 'slug' | 'address'>;

  const [{ data: roomTypes, error: rtErr }, { data: rooms, error: roomsErr }, { data: bookings, error: bErr }] = await Promise.all([
    client.from('room_types').select('id,hotel_id,name,capacity,base_price').eq('hotel_id', hotel.id).order('base_price'),
    client.from('rooms').select('id,hotel_id,room_type_id,room_number,status').eq('hotel_id', hotel.id),
    client.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status').eq('hotel_id', hotel.id).neq('status', 'cancelled'),
  ]);
  throwOnError(rtErr);
  throwOnError(roomsErr);
  throwOnError(bErr);

  const allRoomTypes = (roomTypes ?? []) as RoomTypeRecord[];
  const allRooms = (rooms ?? []) as Array<{ id: string; hotel_id: string; room_type_id: string; room_number: string; status: string }>;
  const activeBookings = (bookings ?? []) as Array<{ id: string; room_id: string | null; check_in: string; check_out: string; status: string }>;

  const overlappingBookings = activeBookings.filter(b => b.room_id && b.check_in < checkOut && b.check_out > checkIn);
  const bookedRoomIds = new Set(overlappingBookings.map(b => b.room_id!));

  const resultRoomTypes: PublicRoomTypeAvailability[] = [];

  for (const rt of allRoomTypes) {
    const overrides = await listRateOverridesForRoomType(client, rt.id);
    const roomsOfType = allRooms.filter(r => r.room_type_id === rt.id && r.status !== 'maintenance');
    const availableRooms = roomsOfType.filter(r => !bookedRoomIds.has(r.id));
    const availableCount = availableRooms.length;

    let totalPrice = 0;
    for (const date of stayDates) {
      totalPrice += resolveEffectiveRate({ id: rt.id, base_price: rt.base_price }, date, overrides);
    }
    const avgNightly = nights > 0 ? Math.round(totalPrice / nights) : Number(rt.base_price);

    const minStay = getRequiredMinStayNights(checkIn, checkOut, overrides);
    const minStayViolated = minStay != null && nights < minStay;
    const isAvailable = availableCount > 0 && !minStayViolated;

    resultRoomTypes.push({
      id: rt.id,
      name: rt.name,
      capacity: rt.capacity,
      base_price: Number(rt.base_price),
      total_price: totalPrice,
      avg_nightly_price: avgNightly,
      nights,
      rooms_available: availableCount,
      min_stay_nights: minStay,
      is_available: isAvailable,
      min_stay_violated: minStayViolated,
    });
  }

  return {
    hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address },
    check_in: checkIn,
    check_out: checkOut,
    nights,
    room_types: resultRoomTypes,
  };
}

export type CreatePublicBookingInput = {
  slug: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  special_requests?: string | null;
};

export async function createPublicBooking(
  adminClient: SupabaseClient,
  input: CreatePublicBookingInput,
) {
  const stayDates = getStayDates(input.check_in, input.check_out);
  if (stayDates.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Check-out date must be after check-in date.' });
  }
  const nights = stayDates.length;

  const { data: hotelData, error: hotelError } = await adminClient
    .rpc('get_public_hotel', { target_slug: input.slug })
    .single();
  throwOnError(hotelError);
  if (!hotelData) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Hotel not found or not published.' });
  }
  const hotel = hotelData as Pick<HotelRecord, 'id' | 'name' | 'slug' | 'address'>;

  const { data: roomTypeData, error: rtError } = await adminClient
    .from('room_types')
    .select('id,hotel_id,name,capacity,base_price')
    .eq('id', input.room_type_id)
    .eq('hotel_id', hotel.id)
    .maybeSingle();
  throwOnError(rtError);
  if (!roomTypeData) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Selected room type does not exist for this hotel.' });
  }
  const roomType = roomTypeData as RoomTypeRecord;

  const overrides = await listRateOverridesForRoomType(adminClient, roomType.id);
  const minStay = getRequiredMinStayNights(input.check_in, input.check_out, overrides);
  if (minStay != null && nights < minStay) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Booking must be at least ${minStay} night${minStay === 1 ? '' : 's'} (minimum stay for selected dates is ${minStay} night${minStay === 1 ? '' : 's'}).`,
    });
  }

  let totalPrice = 0;
  for (const date of stayDates) {
    totalPrice += resolveEffectiveRate({ id: roomType.id, base_price: roomType.base_price }, date, overrides);
  }

  const [{ data: rooms, error: roomsErr }, { data: bookings, error: bErr }] = await Promise.all([
    adminClient.from('rooms').select('id,hotel_id,room_type_id,room_number,status').eq('hotel_id', hotel.id).eq('room_type_id', roomType.id),
    adminClient.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status').eq('hotel_id', hotel.id).neq('status', 'cancelled'),
  ]);
  throwOnError(roomsErr);
  throwOnError(bErr);

  const candidateRooms = (rooms ?? []).filter((r: any) => r.status !== 'maintenance');
  const overlappingBookings = (bookings ?? []).filter(
    (b: any) => b.room_id && b.check_in < input.check_out && b.check_out > input.check_in,
  );
  const bookedRoomIds = new Set(overlappingBookings.map((b: any) => b.room_id));
  const availableRooms = candidateRooms.filter((r: any) => !bookedRoomIds.has(r.id));

  if (availableRooms.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The selected room type is no longer available for the requested dates. Please choose another date or room type.',
    });
  }

  const assignedRoom = availableRooms[0];

  const trimmedName = input.guest_name.trim();
  const nameParts = trimmedName.split(/\s+/);
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || '-';

  try {
    const createdBooking = await createBookingWithGuests(
      adminClient,
      {
        hotel_id: hotel.id,
        room_id: assignedRoom.id,
        guest_name: trimmedName,
        check_in: input.check_in,
        check_out: input.check_out,
        price: totalPrice,
        source: 'walk-in',
        status: 'confirmed',
      },
      [
        {
          first_name: firstName,
          last_name: lastName,
          middle_name: null,
          gender: null,
          passport_no: 'DIRECT-BOOKING',
          nationality_code: 'THA',
          birth_date: '2000-01-01',
          phone_no: input.guest_phone || null,
        },
      ],
    );

    return {
      success: true,
      booking_id: createdBooking.id,
      hotel_name: hotel.name,
      hotel_address: hotel.address,
      room_type_name: roomType.name,
      room_number: assignedRoom.room_number,
      check_in: input.check_in,
      check_out: input.check_out,
      nights,
      total_price: totalPrice,
      guest_name: trimmedName,
      guest_email: input.guest_email || null,
      guest_phone: input.guest_phone || null,
    };
  } catch (err: any) {
    const msg = err?.message || '';
    const code = err?.code || '';
    if (code === '23P01' || msg.includes('prevent_double_booking') || msg.toLowerCase().includes('exclusion')) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The selected room was just booked by another guest. Please select another date or room type.',
      });
    }
    throw err;
  }
}

export type RateOverrideRecord = {
  id: string;
  room_type_id: string;
  start_date: string;
  end_date: string;
  override_price: number | string;
  min_stay_nights: number | null;
  created_at: string;
};

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
      // 42P01 = undefined_table (migration not yet applied) — treat as no overrides.
      if ((error as { code?: string }).code === '42P01') return [];
      throw error;
    }
    return (data ?? []) as RateOverrideRecord[];
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '42P01') return [];
    // Some PostgREST shims surface missing-table as message without code
    if (err instanceof Error && /rate_overrides.*does not exist/i.test(err.message)) return [];
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

export async function createBookingWithGuests(
  client: SupabaseClient,
  booking: Omit<BookingRecord, 'id' | 'created_at' | 'rooms' | 'guests'>,
  guests: Omit<GuestRecord, 'id' | 'booking_id'>[],
) {
  // Defensive enforcement at the DB layer as well as the router pre-check.
  await assertBookingMinStay(client, booking.room_id, booking.check_in, booking.check_out);

  const { data: createdBooking, error: bookingError } = await client
    .from('bookings')
    .insert(booking)
    .select('id,hotel_id,room_id,guest_name,check_in,check_out,price,source,status,created_at')
    .single();
  throwOnError(bookingError);
  if (!createdBooking) throw new Error('Booking insert did not return a record.');

  if (guests.length) {
    const { error: guestError } = await client.from('guests').insert(
      guests.map(guest => ({ ...guest, booking_id: createdBooking.id })),
    );
    throwOnError(guestError);
  }
  return createdBooking;
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

export type HotelOptionRecord = {
  id: string;
  name: string;
};

export type HotelUserAssignmentRecord = {
  id: string;
  hotel_id: string;
  user_id: string;
  role: HumanRole;
  created_at: string;
  hotels: { name: string } | null;
};

export type CreateHotelUserInput = {
  hotel_id: string;
  user_id: string;
  role: HumanRole;
};

export type HotelAdminAuditLogRecord = {
  id: string;
  hotel_id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: 'hotel_admin_transfer';
  previous_admin_membership_id: string;
  previous_admin_user_id: string;
  new_admin_membership_id: string;
  new_admin_user_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

/** Lists hotel choices for a super-admin assignment form under the caller JWT. */
export async function listHotelOptions(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotels')
    .select('id,name')
    .order('name', { ascending: true });
  throwOnError(error);
  return (data ?? []) as HotelOptionRecord[];
}

/** Lists memberships with hotel names; RLS limits this to records visible to the caller. */
export async function listHotelUserAssignments(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotel_users')
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []).map(row => ({
    ...row,
    hotels: Array.isArray(row.hotels) ? row.hotels[0] ?? null : row.hotels,
  })) as unknown as HotelUserAssignmentRecord[];
}

/** Creates a membership through the authenticated caller's RLS client. */
export async function createHotelUserAssignment(client: SupabaseClient, input: CreateHotelUserInput) {
  const { data, error } = await client
    .from('hotel_users')
    .insert(input)
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Hotel membership insert did not return a record.');
  return {
    ...data,
    hotels: Array.isArray(data.hotels) ? data.hotels[0] ?? null : data.hotels,
  } as unknown as HotelUserAssignmentRecord;
}

/** Transfers Hotel Admin ownership through the Postgres transaction function. */
export async function transferHotelAdmin(
  client: SupabaseClient,
  input: { hotel_id: string; target_membership_id: string },
) {
  const { data, error } = await client
    .rpc('transfer_hotel_admin', {
      target_hotel_id: input.hotel_id,
      target_membership_id: input.target_membership_id,
    })
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  const membership = data as unknown as HotelUserAssignmentRecord;
  return { ...membership, hotels: membership.hotels ?? null };
}

/** Lists property-scoped Hotel Admin audit events; RLS remains the source of truth. */
export async function listHotelAdminAuditLogs(client: SupabaseClient, hotelId: string, limit = 50) {
  const { data, error } = await client
    .from('hotel_admin_audit_logs')
    .select('id,hotel_id,actor_user_id,actor_email,action,previous_admin_membership_id,previous_admin_user_id,new_admin_membership_id,new_admin_user_id,details,created_at')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  throwOnError(error);
  return (data ?? []) as unknown as HotelAdminAuditLogRecord[];
}

/** Removes a membership through the authenticated caller's RLS client. */
export async function deleteHotelUserAssignment(client: SupabaseClient, membershipId: string) {
  const { data, error } = await client
    .from('hotel_users')
    .delete()
    .eq('id', membershipId)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

export type HotelStaffRecord = HotelUserAssignmentRecord & {
  email: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
};

/** Returns only memberships for one hotel; the caller's RLS client remains the source of truth. */
export async function listHotelStaff(client: SupabaseClient, hotelId: string, authUsers: Array<{
  id: string;
  email: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
}>) {
  const assignments = await listHotelUserAssignments(client);
  const usersById = new Map(authUsers.map(user => [user.id, user]));
  return assignments
    .filter(assignment => assignment.hotel_id === hotelId)
    .map(assignment => ({
      ...assignment,
      email: usersById.get(assignment.user_id)?.email ?? null,
      confirmed_at: usersById.get(assignment.user_id)?.confirmed_at ?? null,
      last_sign_in_at: usersById.get(assignment.user_id)?.last_sign_in_at ?? null,
    })) as HotelStaffRecord[];
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

export type HousekeepingTaskStatus = 'pending' | 'in_progress' | 'done';

export type HousekeepingTaskRecord = {
  id: string;
  room_id: string;
  booking_id: string | null;
  assigned_to: string | null;
  due_date: string;
  status: HousekeepingTaskStatus;
  created_at: string;
};

function isMissingHousekeepingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /housekeeping_tasks.*does not exist/i.test(message);
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

// ---------------------------------------------------------------------------
// Messaging: message_threads + messages (in-app per-booking threads)
// ---------------------------------------------------------------------------

export type MessageThreadRecord = {
  id: string;
  hotel_id: string;
  booking_id: string | null;
  created_at: string;
};

export type MessageRecord = {
  id: string;
  thread_id: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

function isMissingMessagingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /message_threads|messages.*does not exist/i.test(message);
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

// ---------------------------------------------------------------------------
// Hotel site config: per-hotel hero copy / accent color / visible sections
// ---------------------------------------------------------------------------

export const DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY =
  'Explore room types, rates, and availability directly from this hotel.';
export const DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR = '#954831';

export type HotelSiteConfigRecord = {
  hotel_id: string;
  hero_copy: string | null;
  accent_color: string | null;
  visible_sections: Record<string, boolean> | null;
  updated_at: string;
};

function isMissingHotelSiteConfigTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /hotel_site_config.*does not exist/i.test(message);
}

/** Returns the site config for a hotel, or null if none / table not yet migrated. Gracefully handles 42P01. */
export async function getHotelSiteConfig(
  client: SupabaseClient,
  hotelId: string,
): Promise<HotelSiteConfigRecord | null> {
  try {
    const { data, error } = await client
      .from('hotel_site_config')
      .select('hotel_id,hero_copy,accent_color,visible_sections,updated_at')
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) {
      if (isMissingHotelSiteConfigTableError(error)) return null;
      throw error;
    }
    return (data ?? null) as HotelSiteConfigRecord | null;
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) return null;
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) return null;
    throw err;
  }
}

/** Convenience: resolve hotel id by slug then fetch config. Returns null if hotel or config missing or table missing. */
export async function getHotelSiteConfigBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<HotelSiteConfigRecord | null> {
  try {
    const { data: hotel, error: hotelError } = await client
      .from('hotels')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (hotelError) {
      if (isMissingHotelSiteConfigTableError(hotelError)) return null;
      throw hotelError;
    }
    const hotelId = (hotel as { id?: string } | null)?.id;
    if (!hotelId) return null;
    return await getHotelSiteConfig(client, hotelId);
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) return null;
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) return null;
    throw err;
  }
}

/** Upserts site config for a hotel. Gracefully returns a synthetic record if table not yet migrated. */
export async function saveHotelSiteConfig(
  client: SupabaseClient,
  input: {
    hotel_id: string;
    hero_copy?: string | null;
    accent_color?: string | null;
    visible_sections?: Record<string, boolean> | null;
  },
): Promise<HotelSiteConfigRecord> {
  const payload: Record<string, unknown> = { hotel_id: input.hotel_id, updated_at: new Date().toISOString() };
  if (input.hero_copy !== undefined) payload.hero_copy = input.hero_copy;
  if (input.accent_color !== undefined) payload.accent_color = input.accent_color;
  if (input.visible_sections !== undefined) payload.visible_sections = input.visible_sections;
  try {
    const { data, error } = await client
      .from('hotel_site_config')
      .upsert(payload, { onConflict: 'hotel_id' })
      .select('hotel_id,hero_copy,accent_color,visible_sections,updated_at')
      .single();
    if (error) {
      if (isMissingHotelSiteConfigTableError(error)) {
        return {
          hotel_id: input.hotel_id,
          hero_copy: (input.hero_copy as string | null) ?? null,
          accent_color: (input.accent_color as string | null) ?? null,
          visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
          updated_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Site config upsert did not return a record.');
    return data as HotelSiteConfigRecord;
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) {
      return {
        hotel_id: input.hotel_id,
        hero_copy: (input.hero_copy as string | null) ?? null,
        accent_color: (input.accent_color as string | null) ?? null,
        visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) {
      return {
        hotel_id: input.hotel_id,
        hero_copy: (input.hero_copy as string | null) ?? null,
        accent_color: (input.accent_color as string | null) ?? null,
        visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Hotel media: list / create / delete (write helpers; read already exists)
// ---------------------------------------------------------------------------

export type HotelMediaRecord = {
  id: string;
  hotel_id: string;
  url: string;
  caption: string | null;
  is_hero: boolean;
  display_order: number;
  created_at: string;
};

export async function listHotelMedia(
  client: SupabaseClient,
  hotelId: string,
): Promise<HotelMediaRecord[]> {
  const { data, error } = await client
    .from('hotel_media')
    .select('id,hotel_id,url,caption,is_hero,display_order,created_at')
    .eq('hotel_id', hotelId)
    .order('display_order', { ascending: true });
  throwOnError(error);
  return (data ?? []) as HotelMediaRecord[];
}

export async function createHotelMedia(
  client: SupabaseClient,
  input: { hotel_id: string; url: string; caption?: string | null; is_hero?: boolean; display_order?: number },
): Promise<HotelMediaRecord> {
  const { data, error } = await client
    .from('hotel_media')
    .insert({
      hotel_id: input.hotel_id,
      url: input.url,
      caption: input.caption ?? null,
      is_hero: input.is_hero ?? false,
      display_order: input.display_order ?? 0,
    })
    .select('id,hotel_id,url,caption,is_hero,display_order,created_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Hotel media insert did not return a record.');
  return data as HotelMediaRecord;
}

export async function deleteHotelMedia(
  client: SupabaseClient,
  mediaId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from('hotel_media')
    .delete()
    .eq('id', mediaId)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

export async function setHotelMediaHero(
  client: SupabaseClient,
  hotelId: string,
  mediaId: string,
): Promise<void> {
  // Clear hero flag for all media in this hotel
  const { error: err1 } = await client
    .from('hotel_media')
    .update({ is_hero: false })
    .eq('hotel_id', hotelId);
  throwOnError(err1);

  // Set hero flag for the specified media
  const { error: err2 } = await client
    .from('hotel_media')
    .update({ is_hero: true })
    .eq('id', mediaId)
    .eq('hotel_id', hotelId);
  throwOnError(err2);
}

/** Updates one property membership through the authenticated caller's RLS client. */
export async function updateHotelUserAssignmentRole(
  client: SupabaseClient,
  input: { membership_id: string; hotel_id: string; role: HumanRole },
) {
  const { data, error } = await client
    .from('hotel_users')
    .update({ role: input.role })
    .eq('id', input.membership_id)
    .eq('hotel_id', input.hotel_id)
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return {
    ...data,
    hotels: Array.isArray(data.hotels) ? data.hotels[0] ?? null : data.hotels,
  } as unknown as HotelUserAssignmentRecord;
}

export type NotificationRecord = {
  id: string;
  hotel_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export async function listNotifications(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(50);
  throwOnError(error);
  return (data || []) as NotificationRecord[];
}

export async function listAllNotifications(client: SupabaseClient) {
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  throwOnError(error);
  return (data || []) as NotificationRecord[];
}

export async function markNotificationRead(client: SupabaseClient, notificationId: string) {
  const { data, error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .select()
    .maybeSingle();
  throwOnError(error);
  return data as NotificationRecord | null;
}

export async function markAllNotificationsRead(client: SupabaseClient, hotelId: string) {
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('hotel_id', hotelId)
    .eq('is_read', false);
  throwOnError(error);
}

export async function markSystemNotificationsRead(client: SupabaseClient) {
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  throwOnError(error);
}

export async function insertNotification(client: SupabaseClient, input: { hotel_id: string; type: string; message: string }) {
  const { error } = await client
    .from('notifications')
    .insert([{
      hotel_id: input.hotel_id,
      type: input.type,
      message: input.message
    }]);
  throwOnError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 01 — SlipOK per-hotel payment settings
// Keys are stored AES-256-GCM encrypted (see server/slipokCrypto.ts).
// These functions never return the raw or encrypted key to callers —
// only `configured: boolean` and `enabled: boolean`.
// ─────────────────────────────────────────────────────────────────────────────

export type SlipOkSettingsRow = {
  id: string;
  hotel_id: string;
  slipok_key_enc: string | null;
  slipok_key_hash: string | null;
  slipok_enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** Returns whether a SlipOK key is configured + enabled for the hotel. Never returns the key. */
export async function getSlipOkSettings(
  client: SupabaseClient,
  hotelId: string,
): Promise<{ configured: boolean; enabled: boolean }> {
  const { data, error } = await client
    .from('hotel_payment_settings')
    .select('slipok_key_hash, slipok_enabled')
    .eq('hotel_id', hotelId)
    .maybeSingle();
  throwOnError(error);
  if (!data) return { configured: false, enabled: false };
  return {
    configured: Boolean(data.slipok_key_hash),
    enabled: Boolean(data.slipok_enabled),
  };
}

/**
 * Upsert a SlipOK key for the hotel.
 * Callers must pass the already-encrypted key (enc) and its hash.
 * Encryption is done in the router, not here, to keep DB layer pure.
 */
export async function saveSlipOkSettings(
  client: SupabaseClient,
  hotelId: string,
  encryptedKey: string,
  keyHash: string,
): Promise<void> {
  const { error } = await client
    .from('hotel_payment_settings')
    .upsert(
      {
        hotel_id: hotelId,
        slipok_key_enc: encryptedKey,
        slipok_key_hash: keyHash,
        slipok_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    );
  throwOnError(error);
}

/** Remove the SlipOK key (sets enc/hash to NULL, disabled). Does not delete the row. */
export async function removeSlipOkKey(client: SupabaseClient, hotelId: string): Promise<void> {
  const { error } = await client
    .from('hotel_payment_settings')
    .upsert(
      {
        hotel_id: hotelId,
        slipok_key_enc: null,
        slipok_key_hash: null,
        slipok_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    );
  throwOnError(error);
}
