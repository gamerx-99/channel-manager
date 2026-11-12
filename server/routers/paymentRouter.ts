import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { rateLimitedProcedure, protectedProcedure, router } from '../_core/trpc';
import { authorizeHotelAction, createD1GuestPaymentCallerContext, type D1ScopedDatabase } from '../db/scope';
import {
  getHotelPaymentConfig,
  getSlipOkCredentialsForVerification,
  getLatestPaymentSession,
  createPaymentSession,
  updateBookingPaymentStatus,
  updatePaymentSessionStatus,
  finalizePaymentSession,
  confirmManualFullPayment,
  savePaymentSessionSlip,
} from '../d1/payment';
import { claimBookingNights, expireBookingIfPast, logBookingStatusChange, sendBookingNotice } from '../d1/booking';
import { releaseNightsStatement } from '../d1/bookingNights';
import { createEmailSender } from '../email';
import { resolveAppUrl } from '../appUrl';
import { bookings, hotels, hotelPaymentSettings, paymentSessions, rooms, roomTypes } from '../../drizzle/d1-schema';
import { eq, and, desc } from 'drizzle-orm';
import { generatePromptPayQR, buildQrImageUrl } from '../promptpay';
import { normalisePromptPayId } from '../../shared/promptPayId';
import { decryptSlipOkKey } from '../slipokCrypto';
import { verifySlipWithSlipOk, SlipOkError } from '../slipVerification';
import { healthFromSlipOkError, recordSlipOkHealth } from '../d1/slipokHealth';
import { rethrowDomainError, requireHotelPermission } from '../routerUtils';
import { assertValidTransition, type BookingStatus } from '@shared/bookingLifecycle';
import { moneyToSatang } from '../db/money';
import { isBillingCandidateEnabled } from '@shared/billingCandidate';

/** Guests have no login; a booking on a published hotel is what lets them pay it. */
async function guestPaymentCaller(db: D1ScopedDatabase, bookingId: string, hotelId?: string) {
  const [row] = await db.select({ hotelId: bookings.hotelId, publicEnabled: hotels.publicEnabled })
    .from(bookings).innerJoin(hotels, eq(hotels.id, bookings.hotelId))
    .where(eq(bookings.id, bookingId)).limit(1);
  if (!row?.publicEnabled || (hotelId && hotelId !== row.hotelId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
  }
  return createD1GuestPaymentCallerContext(row.hotelId);
}

function publicAppUrl(ctx: { publicAppUrl?: string; req?: { url?: string } }) {
  return resolveAppUrl(ctx.publicAppUrl ?? (ctx.req?.url ? new URL(ctx.req.url).origin : undefined));
}

function decodeSlipBase64(value: string) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid slip image.' });
  }
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  const step = 0x8000;
  for (let start = 0; start < bytes.length; start += step) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(start, start + step)));
  }
  return btoa(binary);
}

export const paymentRouter = router({
  createSession: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      const db = ctx.db;
      try {
        const guest = await guestPaymentCaller(db, input.booking_id, input.hotel_id);
        const config = await getHotelPaymentConfig(db, guest, input.hotel_id);
        if (!config?.promptpay_id || !normalisePromptPayId(config.promptpay_id)) {
          console.warn('[payment.createSession] PromptPay unavailable for hotel', input.hotel_id);
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This property cannot take PromptPay payments right now. Please contact the property directly.',
          });
        }

        const [booking] = await db.select({ price: bookings.price, status: bookings.status, paymentStatus: bookings.paymentStatus })
          .from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
        if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        if (isBillingCandidateEnabled(ctx.billingEnv?.BILLING_CANDIDATE_ENABLED) && booking.status === 'confirmed' && booking.paymentStatus === 'verified') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is already fully paid.' });
        }

        const existingSession = await getLatestPaymentSession(db, guest, input.booking_id, input.hotel_id);
        if (existingSession && existingSession.status === 'pending') {
          return {
            sessionId: existingSession.id,
            qrImageUrl: buildQrImageUrl(existingSession.qr_string ?? ''),
            qrString: existingSession.qr_string,
            amount: Number(existingSession.amount),
            expiresAt: existingSession.expires_at,
          };
        }

        const bookingStatus = booking.status as BookingStatus;
        const isHoldFlowBooking = bookingStatus === 'pending_payment' || bookingStatus === 'payment_rejected';
        if (isHoldFlowBooking) {
          const current = await expireBookingIfPast(db, guest, input.booking_id, input.hotel_id);
          if (current?.status === 'expired') {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This payment window has expired.' });
          }
        } else if (bookingStatus !== 'confirmed') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not ready for payment.' });
        }

        const amount = Number(booking.price);
        const ref = `BK-${input.booking_id.slice(0, 8).toUpperCase()}`;
        const timeoutMs = (config.payment_timeout_minutes ?? 15) * 60 * 1000;
        const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

        const qrString = generatePromptPayQR({
          promptPayId: config.promptpay_id,
          amount,
          ref,
        });

        const session = await createPaymentSession(db, guest, {
          booking_id: input.booking_id,
          hotel_id: input.hotel_id,
          amount,
          qr_reference: ref,
          qr_string: qrString,
          expires_at: expiresAt,
        });

        await updateBookingPaymentStatus(db, guest, input.hotel_id, input.booking_id, 'pending');

        if (isHoldFlowBooking) {
          await db.update(bookings).set({ expiresAt: new Date(expiresAt) }).where(eq(bookings.id, input.booking_id));
        }

        return {
          sessionId: session.id,
          qrImageUrl: buildQrImageUrl(qrString),
          qrString,
          amount,
          expiresAt,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  // ASSUMPTION: a booking UUID is the bearer link for the guest's own booking summary,
  // matching the existing public payment procedures; only a published hotel is readable.
  getGuestBooking: rateLimitedProcedure
    .input(z.object({ booking_id: z.string().uuid(), hotel_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      try {
        const guest = await guestPaymentCaller(ctx.db, input.booking_id, input.hotel_id);
        const [row] = await ctx.db.select({
          id: bookings.id,
          hotelId: bookings.hotelId,
          hotelSlug: hotels.slug,
          guestName: bookings.guestName,
          checkIn: bookings.checkIn,
          checkOut: bookings.checkOut,
          price: bookings.price,
          status: bookings.status,
          paymentStatus: bookings.paymentStatus,
          roomId: bookings.roomId,
          hotelName: hotels.name,
          hotelAddress: hotels.address,
          hotelEmail: hotels.notificationEmail,
          hotelPhone: hotels.publicPhone,
          ownerContact: hotels.ownerContact,
        }).from(bookings).innerJoin(hotels, eq(hotels.id, bookings.hotelId))
          .where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, guest.guestPaymentHotelId))).limit(1);
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        const [type] = row.roomId
          ? await ctx.db.select({ name: roomTypes.name }).from(rooms).innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id)).where(eq(rooms.id, row.roomId)).limit(1)
          : [];
        return {
          booking_id: row.id,
          hotel_id: row.hotelId,
          hotel_slug: row.hotelSlug,
          hotel_name: row.hotelName,
          hotel_address: row.hotelAddress,
          hotel_email: row.hotelEmail,
          hotel_phone: row.hotelPhone || row.ownerContact,
          guest_name: row.guestName,
          check_in: row.checkIn,
          check_out: row.checkOut,
          room_type: type?.name ?? 'Not assigned',
          amount: Number(row.price),
          status: row.status,
          payment_status: row.paymentStatus,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  checkStatus: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      session_id: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      const db = ctx.db;
      try {
        const guest = await guestPaymentCaller(db, input.booking_id);
        const hotelId = guest.guestPaymentHotelId;
        const session = await getLatestPaymentSession(db, guest, input.booking_id, hotelId);
        if (!session || session.id !== input.session_id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
        }

        const bookingState = await expireBookingIfPast(db, guest, input.booking_id, hotelId);
        if (bookingState?.status === 'expired') return { status: 'expired' as const, verifiedAt: null };
        // A slip waiting for staff keeps its session open while the booking
        // request's review window remains active.
        const [booking] = await db.select({ status: bookings.status, paymentStatus: bookings.paymentStatus }).from(bookings)
          .where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, hotelId))).limit(1);
        // A staff decision is authoritative for the guest-facing payment result.
        if (booking?.status === 'confirmed' && booking.paymentStatus === 'verified') {
          return { status: 'paid' as const, verifiedAt: session.verified_at };
        }
        if (booking?.status === 'payment_rejected' && booking.paymentStatus === 'failed') {
          return { status: 'failed' as const, verifiedAt: null };
        }
        if (booking?.status === 'pending_verification' && session.status === 'pending') {
          return { status: 'under_review' as const, verifiedAt: null };
        }

        const now = new Date();
        const expired = now > new Date(session.expires_at);
        if (session.status === 'pending' && expired) {
          await updatePaymentSessionStatus(db, guest, hotelId, session.id, 'expired');
          await updateBookingPaymentStatus(db, guest, hotelId, session.booking_id, 'failed');
          return { status: 'expired' as const, verifiedAt: null };
        }

        return {
          status: session.status,
          verifiedAt: session.verified_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  verifySlip: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid().optional(),
      session_id: z.string().uuid(),
      slip_data: z.string().min(1).max(5_000_000),
      slip_content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional().default('image/jpeg'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      const db = ctx.db;
      try {
        const guest = await guestPaymentCaller(db, input.booking_id);
        const session = await getLatestPaymentSession(db, guest, input.booking_id, guest.guestPaymentHotelId);
        if (!session || session.id !== input.session_id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
        }
        if (!ctx.media) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Private slip storage is unavailable.' });
        const slipBytes = decodeSlipBase64(input.slip_data);
        if (slipBytes.byteLength === 0 || slipBytes.byteLength > 3_500_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Slip image must be 3.5 MiB or smaller.' });
        }
        if (input.hotel_id && input.hotel_id !== session.hotel_id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment session does not belong to the supplied hotel.' });
        }
        const hotelId = session.hotel_id;

        const expiredBooking = await expireBookingIfPast(db, guest, session.booking_id, hotelId);
        if (expiredBooking?.status === 'expired') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This payment window has expired.' });
        }

        if (new Date() > new Date(session.expires_at)) {
          await updatePaymentSessionStatus(db, guest, hotelId, session.id, 'expired');
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Payment session has expired.' });
        }

        const [booking] = await db.select({ id: bookings.id, status: bookings.status, expiresAt: bookings.expiresAt, createdAt: bookings.createdAt }).from(bookings).where(eq(bookings.id, session.booking_id)).limit(1);
        if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        const bookingStatus = booking.status as BookingStatus;

        if (bookingStatus !== 'pending_payment' && bookingStatus !== 'payment_rejected') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not awaiting payment verification.' });
        }

        assertValidTransition(bookingStatus, 'pending_verification');
        // Only one submit may move the booking on; a concurrent one sees no row.
        const [requestSettings] = await db.select({ hours: hotelPaymentSettings.bookingRequestTimeoutHours })
          .from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
        const reviewExpiresAt = new Date(booking.createdAt.getTime() + (requestSettings?.hours ?? 24) * 60 * 60 * 1000);
        if (reviewExpiresAt.getTime() <= Date.now()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking request has expired.' });
        const [claimed] = await db.update(bookings).set({ status: 'pending_verification', expiresAt: reviewExpiresAt })
          .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, bookingStatus)))
          .returning({ id: bookings.id });
        if (!claimed) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This booking is already being verified. Please wait for the result.' });
        }
        await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: bookingStatus, to_status: 'pending_verification', reason: 'slip_submitted' });

        const slipObjectKey = `payment-slips/${hotelId}/${session.id}`;
        try {
          await ctx.media.put(slipObjectKey, slipBytes, {
            httpMetadata: { contentType: input.slip_content_type, cacheControl: 'private, no-store' },
            customMetadata: { hotelId, bookingId: session.booking_id },
          });
          await savePaymentSessionSlip(db, guest, hotelId, session.id, slipObjectKey);
        } catch (error) {
          try { await ctx.media.delete(slipObjectKey); } catch { /* Best effort cleanup for a failed evidence write. */ }
          await db.update(bookings).set({ status: bookingStatus, expiresAt: booking.expiresAt })
            .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, 'pending_verification')));
          await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: bookingStatus, reason: 'slip_storage_failed' });
          console.error('[verifySlip] could not persist uploaded slip:', error instanceof Error ? error.message : error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Slip could not be saved. Please retry the upload.' });
        }

        const manualReview = async (reason: string) => {
          await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'pending_verification', reason });
          await sendBookingNotice(db, ctx.emailSender ?? createEmailSender(), session.booking_id, hotelId, 'booking_awaiting_check', ['hotel'], publicAppUrl(ctx), session.id);
          return { verified: false as const, pendingManualReview: true as const, message: 'ระบบกำลังตรวจสอบสลิปของคุณ กรุณารอการยืนยันจากเจ้าหน้าที่' };
        };

        try {
          // SlipOK is optional per hotel; without a key, staff check the slip.
          const config = await getSlipOkCredentialsForVerification(db, guest, hotelId);
          if (!config?.slipok_key_enc || !config.slipok_branch_id) {
            return await manualReview('slipok_not_configured_manual_review_required');
          }
          const apiKey = await decryptSlipOkKey(config.slipok_key_enc, ctx.billingEnv?.SLIPOK_ENCRYPTION_KEY);

          const result = await verifySlipWithSlipOk({ apiKey, branchId: config.slipok_branch_id }, {
            slipData: input.slip_data,
            expectedAmount: Number(session.amount),
            contentType: input.slip_content_type,
          });
          // SlipOK answered, so the hotel's account works; this clears any earlier warning.
          await recordSlipOkHealth(db, ctx.emailSender ?? createEmailSender(), hotelId, 'ok');

          if (result.matched) {
            const candidateEnabled = isBillingCandidateEnabled(ctx.billingEnv?.BILLING_CANDIDATE_ENABLED);
            if (!candidateEnabled) {
              const { duplicateRef } = await finalizePaymentSession(db, guest, hotelId, session.id, {
                status: 'paid',
                verifiedAt: new Date().toISOString(),
                rawResponse: result.raw,
                verifiedTransactionRef: result.transactionRef,
              });
              if (duplicateRef) {
                await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'pending_verification', reason: 'duplicate_slip_ref' });
                throw new TRPCError({ code: 'CONFLICT', message: 'This slip has already been used to verify a different payment. Please contact the hotel.' });
              }
            }
            // A rejected booking lost its hold, so another guest may have the room now.
            if (bookingStatus === 'payment_rejected' && !(await claimBookingNights(db, guest, hotelId, session.booking_id))) {
              return await manualReview('room_unavailable_manual_review_required');
            }
            if (candidateEnabled) {
              const confirmed = await confirmManualFullPayment(db, {
                hotelId, bookingId: session.booking_id, sessionId: session.id,
                amountSatang: result.amount === null ? 0 : Number(moneyToSatang(String(result.amount))),
                transactionReference: result.transactionRef!, userId: 'slipok', reason: 'slipok_auto_verified',
                now: new Date(), rawResponse: result.raw,
              });
              if (!confirmed) return await manualReview('booking_changed_manual_review_required');
            } else {
              assertValidTransition('pending_verification', 'confirmed');
              const [confirmed] = await db.update(bookings).set({ status: 'confirmed', expiresAt: null })
                .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, 'pending_verification')))
                .returning({ id: bookings.id });
              if (!confirmed) return await manualReview('booking_changed_manual_review_required');
              await updateBookingPaymentStatus(db, guest, hotelId, session.booking_id, 'verified');
              await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'confirmed', reason: 'slipok_auto_verified' });
            }
            // The booking is confirmed and its payment verified by now; a mail failure never undoes that.
            await sendBookingNotice(db, ctx.emailSender ?? createEmailSender(), session.booking_id, hotelId, 'booking_confirmed', ['guest', 'hotel'], publicAppUrl(ctx));
            return { verified: true as const, message: 'ชำระเงินสำเร็จ' };
          }

          // A concurrent submit of the same slip may have confirmed this booking;
          // its 1012 reply must not undo that.
          assertValidTransition('pending_verification', 'payment_rejected');
          const [rejected] = await db.update(bookings).set({ status: 'payment_rejected' })
            .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, 'pending_verification')))
            .returning({ id: bookings.id });
          if (!rejected) {
            return { verified: false as const, pendingManualReview: true as const, message: 'ระบบกำลังตรวจสอบสลิปของคุณ กรุณารอการยืนยันจากเจ้าหน้าที่' };
          }
          await db.$client.batch([releaseNightsStatement(db, session.booking_id)]);
          await finalizePaymentSession(db, guest, hotelId, session.id, {
            status: 'failed',
            rawResponse: result.raw,
          });
          await updateBookingPaymentStatus(db, guest, hotelId, session.booking_id, 'failed');
          await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'payment_rejected', reason: 'slipok_amount_or_ref_mismatch' });
          return { verified: false as const, message: 'ไม่พบการชำระเงินที่ตรงกัน กรุณาติดต่อที่พัก' };
        } catch (error) {
          // CONFLICT is the reused-slip answer, already logged for staff.
          if (error instanceof TRPCError && error.code === 'CONFLICT') throw error;
          if (error instanceof SlipOkError) {
            console.error('[verifySlip] SlipOK:', error.code, error.message);
            // An expired package, used-up quota or rejected key is the hotel's to fix: save it and tell them.
            const health = healthFromSlipOkError(error);
            if (health) {
              await recordSlipOkHealth(db, ctx.emailSender ?? createEmailSender(), hotelId, health);
              return await manualReview(`slipok_${health}_manual_review_required`);
            }
            if (error.code === 'UNREADABLE_SLIP') {
              // Nothing is known about the payment, so give back the status and room hold.
              await db.update(bookings).set({ status: bookingStatus, expiresAt: booking.expiresAt })
                .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, 'pending_verification')));
              await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: bookingStatus, reason: 'slipok_unreadable_slip' });
              return { verified: false as const, retrySlip: true as const, message: 'อ่านรูปสลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัดเจนอีกครั้ง' };
            }
            if (error.code === 'API_ERROR') {
              return await manualReview('slipok_api_unavailable_manual_review_required');
            }
            if (error.code === 'INVALID_KEY') {
              // A hotel key problem is not the guest's fault; staff check the slip.
              return await manualReview('slipok_key_rejected_manual_review_required');
            }
          }
          // Unexpected verification failures still require staff review, until
          // the configured booking request window closes.
          console.error('[verifySlip] unexpected error after claim:', error instanceof Error ? error.message : error);
          return await manualReview('verification_error_manual_review_required');
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  manualVerify: protectedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid(),
      approved: z.boolean(),
      note: z.string().trim().max(500).optional(),
      amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),
      transaction_reference: z.string().trim().min(1).max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      const db = ctx.db;
      const caller = ctx.caller ?? { userId: ctx.user.id };
      try {
        await authorizeHotelAction(db, caller, input.hotel_id, 'operations.manage_bookings', 'payment.manual_verify');
        const current = await expireBookingIfPast(db, caller, input.booking_id, input.hotel_id);
        if (current?.status === 'expired') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking request has expired.' });
        const [booking] = await db.select({ id: bookings.id, hotelId: bookings.hotelId, status: bookings.status }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
        if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });

        const currentStatus = booking.status as BookingStatus;
        if (currentStatus !== 'pending_verification') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not awaiting manual verification.' });
        }

        if (!isBillingCandidateEnabled(ctx.billingEnv?.BILLING_CANDIDATE_ENABLED)) {
          const nextStatus: BookingStatus = input.approved ? 'confirmed' : 'payment_rejected';
          assertValidTransition('pending_verification', nextStatus);
          const [updated] = await db.update(bookings).set({ status: nextStatus, ...(input.approved ? { expiresAt: null } : {}) })
            .where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id), eq(bookings.status, 'pending_verification')))
            .returning({ id: bookings.id });
          if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'This booking verification was already resolved.' });
          if (!input.approved) await db.$client.batch([releaseNightsStatement(db, input.booking_id)]);
          await updateBookingPaymentStatus(db, caller, input.hotel_id, input.booking_id, input.approved ? 'verified' : 'failed');
          const baselineSession = await getLatestPaymentSession(db, caller, input.booking_id, input.hotel_id);
          if (baselineSession?.status === 'pending') {
            await updatePaymentSessionStatus(db, caller, input.hotel_id, baselineSession.id, input.approved ? 'paid' : 'failed', input.approved ? new Date().toISOString() : undefined);
          }
          await logBookingStatusChange(db, caller, { booking_id: input.booking_id, hotel_id: input.hotel_id, from_status: 'pending_verification', to_status: nextStatus, changed_by: ctx.user.id, reason: input.note?.trim() || (input.approved ? 'manual_approve' : 'manual_reject') });
          if (input.approved) await sendBookingNotice(db, ctx.emailSender ?? createEmailSender(), input.booking_id, input.hotel_id, 'booking_confirmed', ['guest', 'hotel'], publicAppUrl(ctx));
          return { booking_id: input.booking_id, status: nextStatus };
        }

        const session = await getLatestPaymentSession(db, caller, input.booking_id, input.hotel_id);
        if (input.approved) {
          if (!input.amount || !input.transaction_reference) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter the actual amount received and the bank transaction reference.' });
          }
          if (!session || session.status !== 'pending') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'A pending payment session is required.' });
          const receivedSatang = moneyToSatang(input.amount);
          if (receivedSatang <= BigInt(0) || receivedSatang > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter a valid positive payment amount.' });
          }
          if (receivedSatang !== moneyToSatang(session.amount)) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The amount received must equal the full payment session amount.' });
          }
          const confirmed = await confirmManualFullPayment(db, {
            hotelId: input.hotel_id, bookingId: input.booking_id, sessionId: session.id,
            amountSatang: Number(receivedSatang), transactionReference: input.transaction_reference.trim(), userId: ctx.user.id,
            reason: input.note?.trim() || 'manual_approve', now: new Date(),
          });
          if (!confirmed) throw new TRPCError({ code: 'CONFLICT', message: 'This booking or payment session was already resolved, or the amount changed.' });
          await sendBookingNotice(db, ctx.emailSender ?? createEmailSender(), input.booking_id, input.hotel_id, 'booking_confirmed', ['guest', 'hotel'], publicAppUrl(ctx));
          return { booking_id: input.booking_id, status: 'confirmed' as const };
        }

        const nextStatus: BookingStatus = 'payment_rejected';
        assertValidTransition('pending_verification', nextStatus);

        const [updated] = await db.update(bookings).set({ status: nextStatus })
          .where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id), eq(bookings.status, 'pending_verification')))
          .returning({ id: bookings.id });
        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'This booking verification was already resolved.' });
        if (!input.approved) await db.$client.batch([releaseNightsStatement(db, input.booking_id)]);
        await updateBookingPaymentStatus(db, caller, input.hotel_id, input.booking_id, input.approved ? 'verified' : 'failed');
        if (session?.status === 'pending') await updatePaymentSessionStatus(db, caller, input.hotel_id, session.id, 'failed');
        await logBookingStatusChange(db, caller, { booking_id: input.booking_id, hotel_id: input.hotel_id, from_status: 'pending_verification', to_status: nextStatus, changed_by: ctx.user.id, reason: input.note?.trim() || 'manual_reject' });

        return { booking_id: input.booking_id, status: nextStatus };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  getSlip: protectedProcedure
    .input(z.object({ booking_id: z.string().uuid(), hotel_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      if (!ctx.media) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Private slip storage is unavailable.' });
      const caller = ctx.caller ?? { userId: ctx.user.id };
      try {
        await authorizeHotelAction(ctx.db, caller, input.hotel_id, 'operations.view_bookings', 'payment.slip.read');
        const [session] = await ctx.db.select({ slipUrl: paymentSessions.slipUrl })
          .from(paymentSessions)
          .where(and(eq(paymentSessions.bookingId, input.booking_id), eq(paymentSessions.hotelId, input.hotel_id)))
          .orderBy(desc(paymentSessions.createdAt)).limit(1);
        if (!session?.slipUrl) return null;
        const evidence = await ctx.media.get(session.slipUrl);
        if (!evidence) return null;
        const bytes = new Uint8Array(await evidence.arrayBuffer());
        const contentType = evidence.httpMetadata?.contentType ?? 'image/jpeg';
        return { contentType, dataUrl: `data:${contentType};base64,${base64FromBytes(bytes)}` };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
});
