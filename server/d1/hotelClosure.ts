import type { R2Bucket } from "@cloudflare/workers-types/index.ts";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { closureTimeline, purgeCutoff } from "@shared/hotelClosure";
import {
  availability, bookingServices, bookingStatusLog, bookings, guests, hotelMedia, hotelPaymentSettings, hotelServices, hotelSiteConfig, hotelUsers, hotels,
  housekeepingTasks, messageThreads, messages, paymentSessions, rateOverrides, roomTypes, rooms,
} from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

const PURGES_PER_RUN = 5;

/** The hotels this owner has in closure, for the status page. */
export async function listOwnClosures(db: D1ScopedDatabase, caller: D1CallerContext, now = new Date()) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "FORBIDDEN" });
  const rows = await db.select({ id: hotels.id, name: hotels.name, requestedAt: hotels.closureRequestedAt })
    .from(hotelUsers).innerJoin(hotels, eq(hotelUsers.hotelId, hotels.id))
    .where(and(eq(hotelUsers.userId, caller.userId), eq(hotelUsers.role, "hotel_owner"), isNotNull(hotels.closureRequestedAt)));
  return rows.map(row => {
    const timeline = closureTimeline(row.requestedAt!);
    return {
      id: row.id, name: row.name, requested_at: row.requestedAt!, ...timeline,
      can_cancel: now < timeline.serviceEndsAt,
      can_export: now < timeline.exportEndsAt,
    };
  });
}

/**
 * Starts the wait. The site, new bookings and iCal stop at once, and everyone but the owner
 * loses this hotel (see resolveScope), so support keys and unused signup links end here too.
 */
export async function requestHotelClosure(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.close_hotel", "hotel.closure.request", now);
  const nowMs = now.getTime();
  const [closed] = await db.$client.batch([
    db.$client.prepare(`update hotels set closure_requested_at = ?, closure_was_public = public_enabled, public_enabled = 0
      where id = ? and closure_requested_at is null`).bind(nowMs, hotelId),
    db.$client.prepare(`update support_access_grants set revoked_at = ? where hotel_id = ? and revoked_at is null and expires_at > ?`).bind(nowMs, hotelId, nowMs),
    db.$client.prepare(`update hotel_signup_links set expires_at = ? where hotel_id = ? and used_at is null and expires_at > ?`).bind(nowMs, hotelId, nowMs),
  ]);
  if (closed!.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "This hotel is already closing." });
  return closureTimeline(now);
}

/** Only an explicit cancel by the owner, inside the wait, reverses a closure. Signing in never does. */
export async function cancelHotelClosure(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.close_hotel", "hotel.closure.cancel", now);
  const [hotel] = await db.select({ requestedAt: hotels.closureRequestedAt }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel?.requestedAt || now >= closureTimeline(hotel.requestedAt).serviceEndsAt) {
    throw new TRPCError({ code: "CONFLICT", message: "The time to cancel has ended." });
  }
  // The request time stays in the where clause, so this cannot race the deadline read above.
  const [hotelRow] = await db.$client.batch([
    db.$client.prepare(`update hotels set public_enabled = coalesce(closure_was_public, 0), closure_requested_at = null, closure_was_public = null
      where id = ? and closure_requested_at = ?`).bind(hotelId, hotel.requestedAt.getTime()),
  ]);
  if (hotelRow!.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "The time to cancel has ended." });
  return { success: true as const };
}

/**
 * The hotel's own records, as the owner takes them away (Terms 7.3). Credentials, tokens, IP
 * hashes and staff user ids are left out on purpose: columns are listed, never `select *`.
 */
export async function exportHotelData(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.close_hotel", "hotel.closure.export", now);
  const [hotel] = await db.select({
    name: hotels.name, slug: hotels.slug, address: hotels.address, owner_contact: hotels.ownerContact, created_at: hotels.createdAt,
    closure_requested_at: hotels.closureRequestedAt,
  }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found." });
  if (hotel.closure_requested_at && now >= closureTimeline(hotel.closure_requested_at).exportEndsAt) {
    throw new TRPCError({ code: "FORBIDDEN", message: "The time to download this hotel's data has ended." });
  }

  const inHotelBookings = eq(bookings.hotelId, hotelId);
  const inHotelRoomTypes = eq(roomTypes.hotelId, hotelId);
  const [
    roomTypeRows, roomRows, rateRows, availabilityRows, serviceRows, bookingRows, guestRows, bookingServiceRows, statusRows,
    paymentRows, messageRows, taskRows, mediaRows, siteRows, paymentSettingRows,
  ] = await Promise.all([
    db.select({ id: roomTypes.id, name: roomTypes.name, capacity: roomTypes.capacity, base_price: roomTypes.basePrice, base_occupancy: roomTypes.baseOccupancy, max_occupancy: roomTypes.maxOccupancy })
      .from(roomTypes).where(inHotelRoomTypes),
    db.select({ id: rooms.id, room_type_id: rooms.roomTypeId, room_number: rooms.roomNumber, status: rooms.status }).from(rooms).where(eq(rooms.hotelId, hotelId)),
    db.select({ room_type_id: rateOverrides.roomTypeId, start_date: rateOverrides.startDate, end_date: rateOverrides.endDate, override_price: rateOverrides.overridePrice, min_stay_nights: rateOverrides.minStayNights })
      .from(rateOverrides).innerJoin(roomTypes, eq(rateOverrides.roomTypeId, roomTypes.id)).where(inHotelRoomTypes),
    db.select({ room_type_id: availability.roomTypeId, date: availability.date, price: availability.price, rooms_available: availability.roomsAvailable })
      .from(availability).innerJoin(roomTypes, eq(availability.roomTypeId, roomTypes.id)).where(inHotelRoomTypes),
    db.select({ name: hotelServices.name, pricing_model: hotelServices.pricingModel, unit_price: hotelServices.unitPrice, is_active: hotelServices.isActive })
      .from(hotelServices).where(eq(hotelServices.hotelId, hotelId)),
    db.select({
      id: bookings.id, room_id: bookings.roomId, guest_name: bookings.guestName, check_in: bookings.checkIn, check_out: bookings.checkOut, price: bookings.price,
      source: bookings.source, status: bookings.status, payment_status: bookings.paymentStatus, payment_method: bookings.paymentMethod, adults_count: bookings.adultsCount,
      children_count: bookings.childrenCount, marketing_consent: bookings.marketingConsent, marketing_consent_at: bookings.marketingConsentAt, created_at: bookings.createdAt,
    }).from(bookings).where(inHotelBookings),
    db.select({
      booking_id: guests.bookingId, first_name: guests.firstName, middle_name: guests.middleName, last_name: guests.lastName, gender: guests.gender,
      passport_no: guests.passportNo, nationality_code: guests.nationalityCode, birth_date: guests.birthDate, phone_no: guests.phoneNo,
    }).from(guests).innerJoin(bookings, eq(guests.bookingId, bookings.id)).where(inHotelBookings),
    db.select({ booking_id: bookingServices.bookingId, service_name: bookingServices.serviceName, pricing_model: bookingServices.pricingModel, unit_price: bookingServices.unitPrice, quantity: bookingServices.quantity, total_price: bookingServices.totalPrice })
      .from(bookingServices).innerJoin(bookings, eq(bookingServices.bookingId, bookings.id)).where(inHotelBookings),
    db.select({ booking_id: bookingStatusLog.bookingId, from_status: bookingStatusLog.fromStatus, to_status: bookingStatusLog.toStatus, reason: bookingStatusLog.reason, created_at: bookingStatusLog.createdAt })
      .from(bookingStatusLog).innerJoin(bookings, eq(bookingStatusLog.bookingId, bookings.id)).where(inHotelBookings),
    db.select({ booking_id: paymentSessions.bookingId, amount: paymentSessions.amount, status: paymentSessions.status, verified_at: paymentSessions.verifiedAt, verified_transaction_ref: paymentSessions.verifiedTransactionRef, created_at: paymentSessions.createdAt })
      .from(paymentSessions).where(eq(paymentSessions.hotelId, hotelId)),
    db.select({ booking_id: messageThreads.bookingId, body: messages.body, created_at: messages.createdAt })
      .from(messages).innerJoin(messageThreads, eq(messages.threadId, messageThreads.id)).where(eq(messageThreads.hotelId, hotelId)),
    db.select({ room_id: housekeepingTasks.roomId, booking_id: housekeepingTasks.bookingId, due_date: housekeepingTasks.dueDate, status: housekeepingTasks.status })
      .from(housekeepingTasks).innerJoin(rooms, eq(housekeepingTasks.roomId, rooms.id)).where(eq(rooms.hotelId, hotelId)),
    db.select({ url: hotelMedia.url, caption: hotelMedia.caption }).from(hotelMedia).where(eq(hotelMedia.hotelId, hotelId)),
    db.select({ hero_copy: hotelSiteConfig.heroCopy, accent_color: hotelSiteConfig.accentColor, visible_sections: hotelSiteConfig.visibleSections })
      .from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)),
    db.select({ promptpay_id: hotelPaymentSettings.promptpayId, hold_timeout_minutes: hotelPaymentSettings.holdTimeoutMinutes, payment_timeout_minutes: hotelPaymentSettings.paymentTimeoutMinutes })
      .from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)),
  ]);

  const { closure_requested_at: _closure, ...hotelDetails } = hotel;
  return {
    exported_at: now.toISOString(),
    hotel: hotelDetails,
    site: siteRows[0] ?? null,
    payment_settings: paymentSettingRows[0] ?? null,
    room_types: roomTypeRows,
    rooms: roomRows,
    rate_overrides: rateRows,
    availability: availabilityRows,
    services: serviceRows,
    bookings: bookingRows,
    guests: guestRows,
    booking_services: bookingServiceRows,
    booking_status_log: statusRows,
    payments: paymentRows,
    messages: messageRows,
    housekeeping_tasks: taskRows,
    media: mediaRows,
  };
}

async function deleteHotelObjects(bucket: R2Bucket, hotelId: string) {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${hotelId}/`, cursor });
    if (page.objects.length) await bucket.delete(page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/**
 * Cron: deletes hotels past their date, photos first, so a failed R2 call leaves the row to be
 * picked up by the next run. Every hotel table cascades from `hotels`.
 *
 * ASSUMPTION: this deletes outright rather than keeping unnamed bookings. What the law makes a
 * hotel keep is the hotel's to take away by export.
 */
export async function purgeClosedHotels(db: D1ScopedDatabase, bucket: R2Bucket, now = new Date()) {
  const due = await db.select({ id: hotels.id, requestedAt: hotels.closureRequestedAt }).from(hotels)
    .where(and(isNotNull(hotels.closureRequestedAt), lte(hotels.closureRequestedAt, purgeCutoff(now)))).limit(PURGES_PER_RUN);
  let purged = 0;
  for (const hotel of due) {
    try {
      await deleteHotelObjects(bucket, hotel.id);
      await db.$client.batch([
        db.$client.prepare(`insert into hotel_purge_log (id, hotel_id, closure_requested_at, purged_at) values (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), hotel.id, hotel.requestedAt!.getTime(), now.getTime()),
        db.$client.prepare(`delete from hotels where id = ?`).bind(hotel.id),
      ]);
      purged += 1;
    } catch (error) {
      console.error(`[hotel closure] purge failed for ${hotel.id}:`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return { due: due.length, purged };
}
