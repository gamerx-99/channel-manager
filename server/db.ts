import type { SupabaseClient } from '@supabase/supabase-js';
import type { HumanRole } from '@shared/authorization';

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

export type CreateRoomTypeInput = Pick<RoomTypeRecord, 'hotel_id' | 'name' | 'capacity' | 'base_price'>;

export type UpdateRoomTypeInput = CreateRoomTypeInput & { room_type_id: string };
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
  const { data, error } = await client
    .from('room_types')
    .insert(input)
    .select('id,hotel_id,name,capacity,base_price')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Room type insert did not return a record.');
  return data as RoomTypeRecord;
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

export async function createBookingWithGuests(
  client: SupabaseClient,
  booking: Omit<BookingRecord, 'id' | 'created_at' | 'rooms' | 'guests'>,
  guests: Omit<GuestRecord, 'id' | 'booking_id'>[],
) {
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
