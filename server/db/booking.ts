import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEffectiveRate, getRequiredMinStayNights } from '../pricing';
import { throwOnError } from './utils';
import { listRateOverridesForRoomType, assertBookingMinStay } from './availability';
import { isBookingOccupyingInventory, isExpired, assertValidTransition, type BookingStatus } from '@shared/bookingLifecycle';
import { calcNights, calculateServiceTotal } from '@shared/pricingModels';
import type {
  BookingRecord,
  GuestRecord,
  BookingServiceRecord,
  PublicHotelAvailabilityResult,
  PublicRoomTypeAvailability,
  CreatePublicBookingInput,
  HotelRecord,
  RoomTypeRecord,
} from './types';

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
    client.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status,expires_at').eq('hotel_id', hotel.id),
  ]);
  throwOnError(rtErr);
  throwOnError(roomsErr);
  throwOnError(bErr);

  const allRoomTypes = (roomTypes ?? []) as RoomTypeRecord[];
  const allRooms = (rooms ?? []) as Array<{ id: string; hotel_id: string; room_type_id: string; room_number: string; status: string }>;
  const activeBookings = (bookings ?? []) as Array<{ id: string; room_id: string | null; check_in: string; check_out: string; status: string; expires_at: string | null }>;

  const overlappingBookings = activeBookings.filter(
    b => b.room_id && b.check_in < checkOut && b.check_out > checkIn && isBookingOccupyingInventory(b as { status: BookingStatus; expires_at: string | null }),
  );
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
    adminClient.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status,expires_at').eq('hotel_id', hotel.id),
  ]);
  throwOnError(roomsErr);
  throwOnError(bErr);

  const candidateRooms = (rooms ?? []).filter((r: any) => r.status !== 'maintenance');
  const candidateRoomIds = new Set(candidateRooms.map((r: any) => r.id));
  const allBookings = (bookings ?? []) as Array<{ id: string; room_id: string | null; check_in: string; check_out: string; status: BookingStatus; expires_at: string | null }>;
  const overlapping = allBookings.filter(
    b => b.room_id && candidateRoomIds.has(b.room_id) && b.check_in < input.check_out && b.check_out > input.check_in,
  );

  // Same lazy-sweep as holdRoomType: a stale held/pending_payment row still sitting at its old
  // status would otherwise make the exclusion constraint reject this INSERT even though
  // isBookingOccupyingInventory (and thus the availability check above) already treats the room
  // as free.
  const stale = overlapping.filter(
    b => (b.status === 'held' || b.status === 'pending_payment' || b.status === 'pending_verification') && isExpired(b.expires_at),
  );
  for (const staleBooking of stale) {
    await expireBookingIfPast(adminClient, staleBooking.id);
  }
  const staleIds = new Set(stale.map(b => b.id));

  const overlappingBookings = overlapping.filter(b => !staleIds.has(b.id) && isBookingOccupyingInventory(b));
  const bookedRoomIds = new Set(overlappingBookings.map(b => b.room_id!));
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

    // Check if hotel has PromptPay configured (for client to decide whether to show QR)
    const { data: paymentConfig } = await adminClient
      .from('hotel_payment_settings')
      .select('promptpay_id')
      .eq('hotel_id', hotel.id)
      .maybeSingle();
    const has_promptpay = !!(paymentConfig?.promptpay_id);

    return {
      success: true,
      booking_id: createdBooking.id,
      hotel_id: hotel.id,
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
      has_promptpay,
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

export async function logBookingStatusChange(
  client: SupabaseClient,
  input: {
    booking_id: string;
    from_status: BookingStatus | null;
    to_status: BookingStatus;
    changed_by?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await client.from('booking_status_log').insert({
    booking_id: input.booking_id,
    from_status: input.from_status ?? null,
    to_status: input.to_status,
    changed_by: input.changed_by ?? null,
    reason: input.reason ?? null,
  });
  throwOnError(error);
}

export async function expireBookingIfPast(
  client: SupabaseClient,
  bookingId: string,
): Promise<{ status: BookingStatus; expires_at: string | null } | null> {
  const { data: booking, error } = await client
    .from('bookings')
    .select('id,status,expires_at')
    .eq('id', bookingId)
    .maybeSingle();
  throwOnError(error);
  if (!booking) return null;

  const row = booking as { id: string; status: BookingStatus; expires_at: string | null };
  if (
    (row.status === 'held' || row.status === 'pending_payment' || row.status === 'pending_verification') &&
    isExpired(row.expires_at)
  ) {
    assertValidTransition(row.status, 'expired');
    const { error: updateError } = await client
      .from('bookings')
      .update({ status: 'expired' } as any)
      .eq('id', bookingId);
    throwOnError(updateError);
    await logBookingStatusChange(client, {
      booking_id: bookingId,
      from_status: row.status,
      to_status: 'expired',
      reason: 'timer_expired',
    });
    return { status: 'expired', expires_at: row.expires_at };
  }

  return row;
}

export async function holdRoomType(
  adminClient: SupabaseClient,
  input: {
    slug: string;
    room_type_id: string;
    check_in: string;
    check_out: string;
  },
): Promise<{
  booking_id: string;
  hotel_id: string;
  room_id: string;
  expires_at: string;
  room_type_name: string;
  room_number: string;
  total_price: number;
  nights: number;
}> {
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

  const [{ data: rooms, error: roomsErr }, { data: bookings, error: bErr }, { data: paymentSettings, error: psErr }] =
    await Promise.all([
      adminClient.from('rooms').select('id,hotel_id,room_type_id,room_number,status').eq('hotel_id', hotel.id).eq('room_type_id', roomType.id),
      adminClient.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status,expires_at').eq('hotel_id', hotel.id),
      adminClient.from('hotel_payment_settings').select('hold_timeout_minutes').eq('hotel_id', hotel.id).maybeSingle(),
    ]);
  throwOnError(roomsErr);
  throwOnError(bErr);
  throwOnError(psErr);

  const candidateRooms = (rooms ?? []).filter((r: any) => r.status !== 'maintenance');
  const candidateRoomIds = new Set(candidateRooms.map((r: any) => r.id));
  const allBookings = (bookings ?? []) as Array<{ id: string; room_id: string | null; check_in: string; check_out: string; status: BookingStatus; expires_at: string | null }>;
  const overlapping = allBookings.filter(
    b => b.room_id && candidateRoomIds.has(b.room_id) && b.check_in < input.check_out && b.check_out > input.check_in,
  );

  // Lazily flip any stale hold on a candidate room before deciding availability. Without this,
  // an abandoned held/pending_payment row that nobody ever reads again (its booking_id lives
  // only in a browser tab that's gone — the resume-by-link case is a documented follow-up, not
  // built yet) sits in the DB forever: isBookingOccupyingInventory would correctly report the
  // room free, but the prevent_double_booking exclusion constraint only looks at *current*
  // status and would still reject the INSERT below with 23P01 — permanently bricking that
  // room+date pair for the public flow.
  const stale = overlapping.filter(
    b => (b.status === 'held' || b.status === 'pending_payment' || b.status === 'pending_verification') && isExpired(b.expires_at),
  );
  for (const staleBooking of stale) {
    await expireBookingIfPast(adminClient, staleBooking.id);
  }
  const staleIds = new Set(stale.map(b => b.id));

  const occupiedBookings = overlapping.filter(
    b => !staleIds.has(b.id) && isBookingOccupyingInventory(b),
  );
  const occupiedRoomIds = new Set(occupiedBookings.map(b => b.room_id!));
  const availableRooms = candidateRooms.filter((r: any) => !occupiedRoomIds.has(r.id));

  if (availableRooms.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The selected room type is no longer available for the requested dates. Please choose another date or room type.',
    });
  }

  const assignedRoom = availableRooms[0];
  const holdTimeoutMinutes = (paymentSettings?.hold_timeout_minutes as number | undefined) ?? 15;
  const expiresAt = new Date(Date.now() + holdTimeoutMinutes * 60000).toISOString();

  try {
    const { data: created, error: insertError } = await adminClient
      .from('bookings')
      .insert({
        hotel_id: hotel.id,
        room_id: assignedRoom.id,
        guest_name: '',
        check_in: input.check_in,
        check_out: input.check_out,
        price: totalPrice,
        source: 'manual',
        status: 'held',
        expires_at: expiresAt,
      } as any)
      .select('id,hotel_id,room_id,guest_name,check_in,check_out,price,source,status,expires_at,created_at')
      .single();

    if (insertError) {
      const msg = insertError.message || '';
      const code = (insertError as any).code || '';
      if (code === '23P01' || msg.includes('prevent_double_booking') || msg.toLowerCase().includes('exclusion')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The selected room type is no longer available for the requested dates. Please choose another date or room type.',
        });
      }
      throwOnError(insertError);
    }
    if (!created) throw new Error('Booking hold insert did not return a record.');

    await logBookingStatusChange(adminClient, {
      booking_id: created.id,
      from_status: null,
      to_status: 'held',
      reason: 'public_hold_created',
    });

    return {
      booking_id: created.id,
      hotel_id: hotel.id,
      room_id: assignedRoom.id,
      expires_at: expiresAt,
      room_type_name: roomType.name,
      room_number: assignedRoom.room_number,
      total_price: totalPrice,
      nights,
    };
  } catch (err: any) {
    const msg = err?.message || '';
    const code = err?.code || '';
    if (code === '23P01' || msg.includes('prevent_double_booking') || msg.toLowerCase().includes('exclusion')) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The selected room type is no longer available for the requested dates. Please choose another date or room type.',
      });
    }
    throw err;
  }
}

export async function confirmBookingDetails(
  adminClient: SupabaseClient,
  input: {
    booking_id: string;
    guest_name: string;
    guest_email?: string | null;
    guest_phone?: string | null;
    special_requests?: string | null;
    services?: Array<{
      service_name: string;
      pricing_model: 'PER_PERSON_PER_NIGHT' | 'PER_NIGHT' | 'ONE_TIME';
      unit_price: number;
      quantity: number;
    }>;
  },
): Promise<{ booking_id: string; hotel_id: string; status: 'pending_payment'; expires_at: string; amount: number }> {
  const { data: booking, error } = await adminClient
    .from('bookings')
    .select('id,hotel_id,status,expires_at,price,check_in,check_out')
    .eq('id', input.booking_id)
    .maybeSingle();
  throwOnError(error);
  if (!booking) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  }

  const current = await expireBookingIfPast(adminClient, input.booking_id);
  if (!current || current.status !== 'held') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This room hold has expired or is no longer available. Please start again.',
    });
  }

  assertValidTransition('held', 'pending_payment');

  const { data: paymentSettings, error: psErr } = await adminClient
    .from('hotel_payment_settings')
    .select('payment_timeout_minutes')
    .eq('hotel_id', (booking as any).hotel_id)
    .maybeSingle();
  throwOnError(psErr);
  const paymentTimeoutMinutes = (paymentSettings?.payment_timeout_minutes as number | undefined) ?? 15;
  const newExpiresAt = new Date(Date.now() + paymentTimeoutMinutes * 60000).toISOString();

  const services = input.services ?? [];
  const nights = calcNights((booking as any).check_in, (booking as any).check_out);
  let servicesTotal = 0;

  // guest_email/phone/special_requests remain accepted-but-not-persisted pending a future migration.
  const updatePayload: any = {
    guest_name: input.guest_name.trim(),
    status: 'pending_payment',
    expires_at: newExpiresAt,
  };

  if (services.length > 0) {
    servicesTotal = services.reduce((sum, s) => sum + calculateServiceTotal(s, nights), 0);
    updatePayload.price = Number((booking as any).price) + servicesTotal;

    const { error: serviceInsertError } = await adminClient.from('booking_services').insert(
      services.map(s => ({
        booking_id: input.booking_id,
        service_name: s.service_name,
        pricing_model: s.pricing_model,
        unit_price: s.unit_price,
        quantity: s.quantity,
        total_price: calculateServiceTotal(s, nights),
      })),
    );
    throwOnError(serviceInsertError);
  }

  const { error: updateError } = await adminClient
    .from('bookings')
    .update(updatePayload)
    .eq('id', input.booking_id);
  throwOnError(updateError);

  await logBookingStatusChange(adminClient, {
    booking_id: input.booking_id,
    from_status: 'held',
    to_status: 'pending_payment',
    reason: 'guest_details_confirmed',
  });

  return {
    booking_id: input.booking_id,
    hotel_id: (booking as any).hotel_id,
    status: 'pending_payment',
    expires_at: newExpiresAt,
    amount: Number((booking as any).price) + servicesTotal,
  };
}

export async function createBookingWithGuests(
  client: SupabaseClient,
  booking: Omit<BookingRecord, 'id' | 'created_at' | 'rooms' | 'guests' | 'services'>,
  guests: Omit<GuestRecord, 'id' | 'booking_id'>[],
  services: Omit<BookingServiceRecord, 'id' | 'booking_id' | 'created_at'>[] = [],
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

  if (services.length) {
    const { error: serviceError } = await client.from('booking_services').insert(
      services.map(service => ({ ...service, booking_id: createdBooking.id })),
    );
    throwOnError(serviceError);
  }

  return createdBooking;
}
