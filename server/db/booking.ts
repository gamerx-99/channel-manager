import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEffectiveRate, getRequiredMinStayNights } from '../pricing';
import { isMissingTableError, throwOnError } from './utils';
import { listRateOverridesForRoomType, assertBookingMinStay } from './availability';
import { isBookingOccupyingInventory, isExpired, assertValidTransition, type BookingStatus } from '@shared/bookingLifecycle';
import { calcNights, calculateServiceTotal } from '@shared/pricingModels';
import {
  evaluateCancellationRefund,
  evaluateNoShowRefund,
  calculateRefundAmount,
  type AcceptedPolicySnapshot,
} from '@shared/cancellationPolicy';
import { calculateStayOccupancyPrice, classifyGuests, fitsOccupancy, type ChildMeasurement } from '@shared/occupancyPricing';
import { resolveHotelBillingState } from '../billing/subscriptionDb';
import type { SubscriptionDecision } from '@shared/billing/subscriptionAccess';
import type {
  BookingRecord,
  GuestRecord,
  BookingServiceRecord,
  PublicHotelAvailabilityResult,
  PublicRoomTypeAvailability,
  HotelRecord,
  RoomTypeRecord,
} from './types';

/**
 * Guest-facing copy for a closed new-booking gate. Keyed by the decision reason
 * so the public wizard can show something actionable instead of a bare error.
 * English only: this is the pre-payment public surface, and RONDMAP rule 6
 * (th/en) applies to the staff-facing screens.
 */
export const BILLING_BLOCK_MESSAGES: Record<
  Exclude<SubscriptionDecision['reason'], 'trialing' | 'active'>,
  string
> = {
  no_subscription: 'Online booking is not available for this hotel at the moment. Please contact the hotel directly.',
  trial_expired: 'This hotel\'s trial period has ended. Please contact the hotel directly.',
  period_ended: 'This hotel is not currently accepting online bookings. Please contact the hotel directly.',
  not_paying: 'This hotel is not currently accepting online bookings. Please contact the hotel directly.',
  suspended: 'Online booking is temporarily unavailable for this hotel.',
  deleted: 'Online booking is unavailable for this hotel.',
};

export async function listBookingsForHotel(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('bookings')
    .select('id,hotel_id,room_id,guest_name,check_in,check_out,adults,children,child_measurements,price,source,status,created_at,rooms(room_number,room_types(name)),guests(id,booking_id,first_name,middle_name,last_name,gender,passport_no,nationality_code,birth_date,phone_no)')
    .eq('hotel_id', hotelId)
    .order('check_in', { ascending: false });
  throwOnError(error);
  type JoinedRoomType = { name: string };
  type JoinedRoom = { room_number: string; room_types: JoinedRoomType | JoinedRoomType[] | null };
  type Relation<T> = T | T[] | null;
  type JoinedBooking = Omit<BookingRecord, 'rooms'> & {
    rooms: Relation<JoinedRoom>;
  };
  const joinedRows = (data ?? []) as unknown as JoinedBooking[];
  const firstRelation = <T,>(relation: Relation<T>): T | null =>
    Array.isArray(relation) ? relation[0] ?? null : relation;
  return joinedRows.map(row => {
    const room = firstRelation(row.rooms);
    const roomType = firstRelation(room?.room_types ?? null);
    return {
      ...row,
      rooms: room
        ? { room_number: room.room_number, room_types: roomType }
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

/**
 * Counts imported OTA blocks per night for one room type over a stay window.
 * Returns an empty map when the ota_import_blocks migration has not been
 * applied yet (same graceful fallback as listOtaImportBlocks).
 */
async function countOtaBlockedNights(
  client: SupabaseClient,
  hotelId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const { data, error } = await client
      .from('ota_import_blocks')
      .select('date')
      .eq('hotel_id', hotelId)
      .eq('room_type_id', roomTypeId)
      .gte('date', checkIn)
      .lt('date', checkOut);
    if (error) {
      if (isMissingTableError('ota_import_blocks', error)) return counts;
      throw error;
    }
    for (const row of (data ?? []) as Array<{ date: string }>) {
      if (!row?.date) continue;
      counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
    }
    return counts;
  } catch (err) {
    if (isMissingTableError('ota_import_blocks', err)) return counts;
    throw err;
  }
}

export async function getPublicHotelAvailability(
  client: SupabaseClient,
  slug: string,
  checkIn: string,
  checkOut: string,
  guests: { adults: number; children: ChildMeasurement[] } = { adults: 2, children: [] },
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

  const { data: roomTypes, error: rtErr } = await client.from('room_types')
    .select('id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max')
    .eq('hotel_id', hotel.id).order('base_price');
  throwOnError(rtErr);
  const allRoomTypes = (roomTypes ?? []) as RoomTypeRecord[];
  const guestInventory = await client.rpc('get_public_room_type_availability_for_guests', {
    target_hotel_id: hotel.id,
    target_check_in: checkIn,
    target_check_out: checkOut,
    target_adults: guests.adults,
    target_children: guests.children,
  });
  const { data: inventoryCounts, error: inventoryErr } = guestInventory;
  throwOnError(inventoryErr);

  const availableCountByRoomType = new Map(
    ((inventoryCounts ?? []) as Array<{ room_type_id: string; rooms_available: number }>).map(row => [row.room_type_id, row.rooms_available]),
  );

  const resultRoomTypes: PublicRoomTypeAvailability[] = [];

  for (const rt of allRoomTypes) {
    const guestClassification = classifyGuests(guests.children, {
      ...rt,
      child_rule: rt.child_rule,
      child_rule_limit: rt.child_rule_limit == null ? null : Number(rt.child_rule_limit),
    });
    if (!fitsOccupancy(rt, guests.adults, guestClassification.qualifyingChildren, guestClassification.adultEquivalentCount)) continue;
    const availableCount = availableCountByRoomType.get(rt.id) ?? 0;
    if (availableCount <= 0) continue;
    const overrides = await listRateOverridesForRoomType(client, rt.id);
    const pricing = calculateStayOccupancyPrice({
      nightlyRates: stayDates.map(date => resolveEffectiveRate({ id: rt.id, base_price: rt.base_price }, date, overrides)),
      rules: rt,
      totalGuestCount: guests.adults + guestClassification.adultEquivalentCount
        + (rt.children_count_toward_max ? guestClassification.qualifyingChildren : 0),
      childRateCounts: guestClassification.childRateCounts,
    });
    const totalPrice = pricing.totalPrice;
    const avgNightly = nights > 0 ? Math.round(totalPrice / nights) : Number(rt.base_price);

    const minStay = getRequiredMinStayNights(checkIn, checkOut, overrides);
    const minStayViolated = minStay != null && nights < minStay;
    const isAvailable = availableCount > 0 && !minStayViolated;

    resultRoomTypes.push({
      id: rt.id,
      name: rt.name,
      capacity: rt.max_occupancy,
      base_price: Number(rt.base_price),
      total_price: totalPrice,
      avg_nightly_price: avgNightly,
      nights,
      rooms_available: availableCount,
      min_stay_nights: minStay,
      is_available: isAvailable,
      min_stay_violated: minStayViolated,
      nightly_prices: pricing.nightlyPrices,
    });
  }

  // Surfaced so the public page can close the book action before the guest
  // reaches the hold step. Read last: it must not change availability output.
  let billing: PublicHotelAvailabilityResult['billing'] = null;
  try {
    const state = await resolveHotelBillingState(client, hotel.id);
    billing = { accepts_new_bookings: state.decision.allowed, reason: state.decision.reason };
  } catch (error) {
    // A billing read failure must not take the whole page down; holdRoomType is
    // the enforcement point and fails closed there.
    billing = null;
  }

  return {
    hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug, address: hotel.address },
    check_in: checkIn,
    check_out: checkOut,
    nights,
    room_types: resultRoomTypes,
    billing,
  };
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

export async function transitionBookingStatus(
  client: SupabaseClient,
  input: { booking_id: string; hotel_id: string; to_status: 'checked_in' | 'checked_out' },
) {
  const { data, error } = await client.rpc('transition_booking_status', {
    target_booking_id: input.booking_id,
    target_hotel_id: input.hotel_id,
    target_status: input.to_status,
  });
  if (error) {
    if (error.code === '42501') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to check guests in or out.' });
    }
    if (error.code === 'P0002') {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
    }
    if (error.code === '22023') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
    }
    throw error;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Booking status transition returned no result.' });
  return result;
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
    adults: number;
    children: ChildMeasurement[];
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

  // SaaS billing gate — the single enforcement point for "may this hotel take
  // a new booking". Owner decision (2026-10-17): a lapsed subscription closes
  // NEW bookings only; existing bookings stay readable so check-in/check-out
  // and ร.ร.4 / ตม.30 obligations continue.
  //
  // This runs before any inventory work so a lapsed hotel returns one clear
  // message instead of a misleading "no availability".
  const billing = await resolveHotelBillingState(adminClient, hotel.id);
  if (!billing.decision.allowed) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: BILLING_BLOCK_MESSAGES[billing.decision.reason],
    });
  }

  const { data: roomTypeData, error: rtError } = await adminClient
    .from('room_types')
    .select('id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max')
    .eq('id', input.room_type_id)
    .eq('hotel_id', hotel.id)
    .maybeSingle();
  throwOnError(rtError);
  if (!roomTypeData) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Selected room type does not exist for this hotel.' });
  }
  const roomType = roomTypeData as RoomTypeRecord;
  const guestClassification = classifyGuests(input.children, {
    ...roomType,
    child_rule: roomType.child_rule,
    child_rule_limit: roomType.child_rule_limit == null ? null : Number(roomType.child_rule_limit),
  });
  if (!fitsOccupancy(roomType, input.adults, guestClassification.qualifyingChildren, guestClassification.adultEquivalentCount)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'The selected room type cannot fit this guest count.' });
  }

  const overrides = await listRateOverridesForRoomType(adminClient, roomType.id);
  const minStay = getRequiredMinStayNights(input.check_in, input.check_out, overrides);
  if (minStay != null && nights < minStay) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Booking must be at least ${minStay} night${minStay === 1 ? '' : 's'} (minimum stay for selected dates is ${minStay} night${minStay === 1 ? '' : 's'}).`,
    });
  }

  const pricing = calculateStayOccupancyPrice({
    nightlyRates: stayDates.map(date => resolveEffectiveRate({ id: roomType.id, base_price: roomType.base_price }, date, overrides)),
    rules: roomType,
    totalGuestCount: input.adults + guestClassification.adultEquivalentCount
      + (roomType.children_count_toward_max ? guestClassification.qualifyingChildren : 0),
    childRateCounts: guestClassification.childRateCounts,
  });
  const totalPrice = pricing.totalPrice;

  const [{ data: rooms, error: roomsErr }, { data: bookings, error: bErr }, { data: paymentSettings, error: psErr }] =
    await Promise.all([
      adminClient.from('rooms').select('id,hotel_id,room_type_id,room_number,status').eq('hotel_id', hotel.id).eq('room_type_id', roomType.id),
      adminClient.from('bookings').select('id,hotel_id,room_id,check_in,check_out,status,expires_at').eq('hotel_id', hotel.id),
      adminClient.from('hotel_payment_settings').select('hold_timeout_minutes').eq('hotel_id', hotel.id).maybeSingle(),
    ]);
  throwOnError(roomsErr);
  throwOnError(bErr);
  throwOnError(psErr);

  // Imported OTA blocks close sellable inventory the same way the public
  // availability RPCs do. Check them here too: the RPC runs at "look" time,
  // but the hold is a separate request, so without this check a guest could
  // hold a room type whose every room is OTA-blocked for the requested dates.
  const otaBlockedByDate = await countOtaBlockedNights(adminClient, hotel.id, roomType.id, input.check_in, input.check_out);

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

  // The whole stay needs a free room on EVERY night: subtract the maximum
  // OTA-blocked count across the stay window, mirroring the availability RPCs.
  const maxOtaBlocked = stayDates.reduce(
    (max, date) => Math.max(max, otaBlockedByDate.get(date) ?? 0),
    0,
  );
  if (availableRooms.length - maxOtaBlocked <= 0) {
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
        adults: input.adults,
        children: input.children.length,
        child_measurements: input.children,
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
    /** B1: policy version the guest saw + accepted before payment. */
    accepted_policy_version?: number | null;
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

  // B1: pin the accepted policy snapshot (version must match current).
  // A missing policy row (pre-migration hotels) means no gate: bookings flow
  // as before with NULL snapshot. A version mismatch means the guest saw a
  // stale policy — reject so the wizard re-shows the current one.
  const { data: policyRow, error: policyErr } = await adminClient
    .from('hotel_cancellation_policies')
    .select('free_cancellation_days,partial_keep_percent,partial_cutoff_days,deposit_percent,no_show_keep_percent,policy_text_th,policy_text_en,version')
    .eq('hotel_id', (booking as any).hotel_id)
    .maybeSingle();
  if (policyErr && (policyErr as any).code !== '42P01') throw policyErr;
  let policySnapshot: Record<string, unknown> | null = null;
  if (policyRow) {
    if (input.accepted_policy_version == null || input.accepted_policy_version !== (policyRow as any).version) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The cancellation policy changed. Please review and accept the current policy.',
      });
    }
    const row = policyRow as any;
    policySnapshot = {
      version: row.version,
      policy_text_th: row.policy_text_th,
      policy_text_en: row.policy_text_en,
      free_cancellation_days: row.free_cancellation_days,
      partial_keep_percent: Number(row.partial_keep_percent),
      partial_cutoff_days: row.partial_cutoff_days,
      deposit_percent: Number(row.deposit_percent),
      no_show_keep_percent: Number(row.no_show_keep_percent),
    };
  }

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
    // B1: NULL when the hotel has no policy row yet (pre-migration).
    policy_snapshot: policySnapshot,
    policy_accepted_at: policySnapshot ? new Date().toISOString() : null,
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
    .select('id,hotel_id,room_id,guest_name,check_in,check_out,adults,children,child_measurements,price,source,status,created_at')
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

/**
 * B1 — staff cancel: confirmed -> cancelled (+ refund_pending when owed).
 * Refund uses the booking's OWN snapshot (never current policy).
 * No snapshot (pre-migration booking) = cancel with refund_amount 0.
 * Hotel transfers offline, then confirms via confirmRefund.
 */
export async function cancelBooking(
  client: SupabaseClient,
  input: { booking_id: string; hotel_id: string; changed_by?: string | null; reason?: string | null },
  nowIso: string = new Date().toISOString(),
): Promise<{ booking_id: string; status: BookingStatus; refund_amount: number }> {
  const { data: booking, error } = await client
    .from('bookings')
    .select('id,hotel_id,status,check_in,price,payment_status,policy_snapshot')
    .eq('id', input.booking_id)
    .eq('hotel_id', input.hotel_id)
    .maybeSingle();
  throwOnError(error);
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  if ((booking as any).status !== 'confirmed') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Only confirmed bookings can be cancelled.' });
  }
  const snapshot = (booking as any).policy_snapshot as AcceptedPolicySnapshot | null;
  const paid = (booking as any).payment_status === 'verified' ? Number((booking as any).price) : 0;
  let refundAmount = 0;
  if (snapshot && paid > 0) {
    refundAmount = calculateRefundAmount(paid, evaluateCancellationRefund(snapshot, nowIso, (booking as any).check_in));
  }
  assertValidTransition('confirmed', 'cancelled');
  const { error: updateError } = await client
    .from('bookings')
    .update({ status: 'cancelled', refund_amount: refundAmount })
    .eq('id', input.booking_id);
  throwOnError(updateError);
  await logBookingStatusChange(client, {
    booking_id: input.booking_id, from_status: 'confirmed', to_status: 'cancelled',
    changed_by: input.changed_by ?? null, reason: input.reason ?? 'staff_cancel',
  });
  if (refundAmount > 0) {
    assertValidTransition('cancelled', 'refund_pending');
    const { error: refundError } = await client
      .from('bookings').update({ status: 'refund_pending' }).eq('id', input.booking_id);
    throwOnError(refundError);
    await logBookingStatusChange(client, {
      booking_id: input.booking_id, from_status: 'cancelled', to_status: 'refund_pending',
      changed_by: input.changed_by ?? null, reason: 'refund_owed',
    });
    return { booking_id: input.booking_id, status: 'refund_pending', refund_amount: refundAmount };
  }
  return { booking_id: input.booking_id, status: 'cancelled', refund_amount: 0 };
}

/** B1 — staff confirms offline transfer done: refund_pending -> refunded. */
export async function confirmRefund(
  client: SupabaseClient,
  input: { booking_id: string; hotel_id: string; changed_by?: string | null },
): Promise<{ booking_id: string; status: 'refunded' }> {
  const { data: booking, error } = await client
    .from('bookings').select('id,status')
    .eq('id', input.booking_id).eq('hotel_id', input.hotel_id).maybeSingle();
  throwOnError(error);
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  if ((booking as any).status !== 'refund_pending') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not awaiting a refund.' });
  }
  assertValidTransition('refund_pending', 'refunded');
  const { error: updateError } = await client
    .from('bookings').update({ status: 'refunded' }).eq('id', input.booking_id);
  throwOnError(updateError);
  await logBookingStatusChange(client, {
    booking_id: input.booking_id, from_status: 'refund_pending', to_status: 'refunded',
    changed_by: input.changed_by ?? null, reason: 'refund_transferred',
  });
  return { booking_id: input.booking_id, status: 'refunded' };
}


/**
 * B1 — no-show: confirmed booking whose guest never arrived.
 * Reuses the cancel edge (confirmed -> cancelled) then refund_pending when owed.
 */
export async function markBookingNoShow(
  client: SupabaseClient,
  input: { booking_id: string; hotel_id: string; changed_by?: string | null },
): Promise<{ booking_id: string; status: BookingStatus; refund_amount: number }> {
  const { data: booking, error } = await client
    .from('bookings').select('id,hotel_id,status,price,payment_status,policy_snapshot')
    .eq('id', input.booking_id).eq('hotel_id', input.hotel_id).maybeSingle();
  throwOnError(error);
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  if ((booking as any).status !== 'confirmed') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Only confirmed bookings can be marked no-show.' });
  }
  const snapshot = (booking as any).policy_snapshot as AcceptedPolicySnapshot | null;
  const paid = (booking as any).payment_status === 'verified' ? Number((booking as any).price) : 0;
  let refundAmount = 0;
  if (snapshot && paid > 0) {
    refundAmount = calculateRefundAmount(paid, evaluateNoShowRefund(snapshot));
  }
  assertValidTransition('confirmed', 'cancelled');
  const { error: updateError } = await client
    .from('bookings').update({ status: 'cancelled', refund_amount: refundAmount }).eq('id', input.booking_id);
  throwOnError(updateError);
  await logBookingStatusChange(client, {
    booking_id: input.booking_id, from_status: 'confirmed', to_status: 'cancelled',
    changed_by: input.changed_by ?? null, reason: 'no_show',
  });
  if (refundAmount > 0) {
    assertValidTransition('cancelled', 'refund_pending');
    const { error: refundError } = await client
      .from('bookings').update({ status: 'refund_pending' }).eq('id', input.booking_id);
    throwOnError(refundError);
    await logBookingStatusChange(client, {
      booking_id: input.booking_id, from_status: 'cancelled', to_status: 'refund_pending',
      changed_by: input.changed_by ?? null, reason: 'no_show_refund_owed',
    });
    return { booking_id: input.booking_id, status: 'refund_pending', refund_amount: refundAmount };
  }
  return { booking_id: input.booking_id, status: 'cancelled', refund_amount: 0 };
}
