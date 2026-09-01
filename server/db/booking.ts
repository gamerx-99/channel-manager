import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEffectiveRate, getRequiredMinStayNights } from '../pricing';
import { throwOnError } from './utils';
import { listRateOverridesForRoomType, assertBookingMinStay } from './availability';
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
