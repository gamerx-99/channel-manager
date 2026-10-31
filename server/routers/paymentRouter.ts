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
} from '../d1/payment';
import { claimBookingNights, expireBookingIfPast, logBookingStatusChange } from '../d1/booking';
import { bookings, hotels } from '../../drizzle/d1-schema';
import { eq, and } from 'drizzle-orm';
import { generatePromptPayQR, buildQrImageUrl } from '../promptpay';
import { decryptSlipOkKey } from '../slipokCrypto';
import { verifySlipWithSlipOk, SlipOkError } from '../slipVerification';
import { rethrowDomainError, requireHotelPermission } from '../routerUtils';
import { assertValidTransition, type BookingStatus } from '@shared/bookingLifecycle';

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
        if (!config?.promptpay_id) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This hotel has not configured PromptPay. Please contact the hotel directly.',
          });
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

        const [booking] = await db.select({ price: bookings.price, status: bookings.status }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
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

        const [booking] = await db.select({ id: bookings.id, status: bookings.status, expiresAt: bookings.expiresAt }).from(bookings).where(eq(bookings.id, session.booking_id)).limit(1);
        if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        const bookingStatus = booking.status as BookingStatus;

        if (bookingStatus !== 'pending_payment' && bookingStatus !== 'payment_rejected') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not awaiting payment verification.' });
        }

        assertValidTransition(bookingStatus, 'pending_verification');
        // Only one submit may move the booking on; a concurrent one sees no row.
        const [claimed] = await db.update(bookings).set({ status: 'pending_verification', expiresAt: null })
          .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, bookingStatus)))
          .returning({ id: bookings.id });
        if (!claimed) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This booking is already being verified. Please wait for the result.' });
        }
        await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: bookingStatus, to_status: 'pending_verification', reason: 'slip_submitted' });

        const manualReview = async (reason: string) => {
          await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'pending_verification', reason });
          return { verified: false as const, pendingManualReview: true as const, message: 'ระบบกำลังตรวจสอบสลิปของคุณ กรุณารอการยืนยันจากเจ้าหน้าที่' };
        };

        try {
          // SlipOK is optional per hotel; without a key, staff check the slip.
          const config = await getSlipOkCredentialsForVerification(db, guest, hotelId);
          if (!config?.slipok_key_enc || !config.slipok_branch_id) {
            return await manualReview('slipok_not_configured_manual_review_required');
          }
          const apiKey = await decryptSlipOkKey(config.slipok_key_enc);

          const result = await verifySlipWithSlipOk({ apiKey, branchId: config.slipok_branch_id }, {
            slipData: input.slip_data,
            expectedAmount: Number(session.amount),
          });

          if (result.matched) {
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

            // A rejected booking lost its hold, so another guest may have the room now.
            if (bookingStatus === 'payment_rejected' && !(await claimBookingNights(db, guest, hotelId, session.booking_id))) {
              return await manualReview('room_unavailable_manual_review_required');
            }

            assertValidTransition('pending_verification', 'confirmed');
            const [confirmed] = await db.update(bookings).set({ status: 'confirmed' })
              .where(and(eq(bookings.id, session.booking_id), eq(bookings.status, 'pending_verification')))
              .returning({ id: bookings.id });
            if (!confirmed) return await manualReview('booking_changed_manual_review_required');
            await updateBookingPaymentStatus(db, guest, hotelId, session.booking_id, 'verified');
            await logBookingStatusChange(db, guest, { booking_id: session.booking_id, hotel_id: hotelId, from_status: 'pending_verification', to_status: 'confirmed', reason: 'slipok_auto_verified' });
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
          // The booking is already pending_verification with no expiry, so an
          // unexpected failure must hand it to staff rather than strand it.
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
    }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
      if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
      const db = ctx.db;
      const caller = ctx.caller ?? { userId: ctx.user.id };
      try {
        await authorizeHotelAction(db, caller, input.hotel_id, 'operations.manage_bookings', 'payment.manual_verify');
        const [booking] = await db.select({ id: bookings.id, hotelId: bookings.hotelId, status: bookings.status }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
        if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });

        const currentStatus = booking.status as BookingStatus;
        if (currentStatus !== 'pending_verification') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This booking is not awaiting manual verification.' });
        }

        const nextStatus: BookingStatus = input.approved ? 'confirmed' : 'payment_rejected';
        assertValidTransition('pending_verification', nextStatus);

        await db.update(bookings).set({ status: nextStatus }).where(eq(bookings.id, input.booking_id));
        await updateBookingPaymentStatus(db, caller, input.hotel_id, input.booking_id, input.approved ? 'verified' : 'failed');
        await logBookingStatusChange(db, caller, { booking_id: input.booking_id, hotel_id: input.hotel_id, from_status: 'pending_verification', to_status: nextStatus, changed_by: ctx.user.id, reason: input.note?.trim() || (input.approved ? 'manual_approve' : 'manual_reject') });

        return { booking_id: input.booking_id, status: nextStatus };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
});
