import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { rateLimitedProcedure, protectedProcedure, router } from '../_core/trpc';
import { createSupabaseAdminClient } from '../supabase';
import {
  getHotelPaymentConfig,
  getLatestPaymentSession,
  createPaymentSession,
  updateBookingPaymentStatus,
  updatePaymentSessionStatus,
  throwOnError,
  finalizePaymentSession,
  logBookingStatusChange,
  expireBookingIfPast,
} from '../db';
import { generatePromptPayQR, buildQrImageUrl } from '../promptpay';
import { decryptSlipOkKey } from '../slipokCrypto';
import { verifySlipWithSlipOk, SlipOkError } from '../slipVerification';
import { rethrowDomainError, requireHotelPermission, rlsClient } from '../routerUtils';
import { assertValidTransition, type BookingStatus } from '@shared/bookingLifecycle';

export const paymentRouter = router({
  /**
   * Create a PromptPay QR payment session for a public booking.
   * Returns QR image URL, amount, expiresAt, and sessionId.
   * Only works if the hotel has a promptpay_id configured.
   */
  createSession: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      // Anonymous guest, no membership — must use the service-role admin
      // client (same pattern as createPublicBooking), never the RLS client:
      // payment_sessions/hotel_payment_settings/bookings all gate on
      // is_hotel_member()/can_manage_bookings(), which an anonymous caller
      // never satisfies.
      const client = createSupabaseAdminClient();
      try {
        const config = await getHotelPaymentConfig(client, input.hotel_id);
        if (!config?.promptpay_id) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This hotel has not configured PromptPay. Please contact the hotel directly.',
          });
        }

        // Get booking amount from latest session or re-fetch
        const existingSession = await getLatestPaymentSession(client, input.booking_id);
        if (existingSession && existingSession.status === 'pending') {
          // Return existing session if still pending
          return {
            sessionId: existingSession.id,
            qrImageUrl: buildQrImageUrl(existingSession.qr_string ?? ''),
            qrString: existingSession.qr_string,
            amount: Number(existingSession.amount),
            expiresAt: existingSession.expires_at,
          };
        }

        // Fetch booking price + lifecycle status
        const { data: booking, error: bookingError } = await client
          .from('bookings')
          .select('price,status')
          .eq('id', input.booking_id)
          .eq('hotel_id', input.hotel_id)
          .single();
        if (bookingError || !booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        }

        // Bookings created via the hold flow (sub-phase B) carry a lazy-expiry deadline on
        // pending_payment/payment_rejected — re-check it here before minting a fresh QR, and
        // never touch bookings.expires_at for the legacy createPublicBooking flow, where a
        // booking is 'confirmed' immediately and has no lifecycle timer at all.
        const bookingStatus = booking.status as BookingStatus;
        const isHoldFlowBooking = bookingStatus === 'pending_payment' || bookingStatus === 'payment_rejected';
        if (isHoldFlowBooking) {
          const current = await expireBookingIfPast(client, input.booking_id);
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

        const session = await createPaymentSession(client, {
          booking_id: input.booking_id,
          hotel_id: input.hotel_id,
          amount,
          qr_reference: ref,
          qr_string: qrString,
          expires_at: expiresAt,
        });

        // Mark booking as pending
        await updateBookingPaymentStatus(client, input.booking_id, 'pending');

        // Re-anchor the booking's own lazy-expiry deadline to the moment the QR was actually
        // generated (not when confirmBookingDetails ran, possibly minutes earlier while the
        // guest sat on a summary/review step) so the countdown shown on screen matches what
        // verifySlip's expireBookingIfPast will actually enforce.
        if (isHoldFlowBooking) {
          const { error: syncError } = await client
            .from('bookings')
            .update({ expires_at: expiresAt })
            .eq('id', input.booking_id);
          throwOnError(syncError);
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

  /** Get the current status of a payment session. */
  checkStatus: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      session_id: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const client = createSupabaseAdminClient();
      try {
        const session = await getLatestPaymentSession(client, input.booking_id);
        if (!session || session.id !== input.session_id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
        }

        // Auto-expire if past expiry time and still pending
        const now = new Date();
        const expired = now > new Date(session.expires_at);
        if (session.status === 'pending' && expired) {
          await updatePaymentSessionStatus(client, session.id, 'expired');
          await updateBookingPaymentStatus(client, session.booking_id, 'failed');
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

  /**
   * Verify a payment slip via SlipOK.
   * On a definitive match: session → paid, booking → confirmed.
   * On a definitive mismatch: session → failed, booking → payment_rejected.
   * On SlipOK API failure: booking stays in pending_verification for manual review.
   * API key never reaches client.
   */
  verifySlip: rateLimitedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid().optional(),
      session_id: z.string().uuid(),
      /** Base64 encoded slip image */
      slip_data: z.string().min(1).max(5_000_000), // ~3.7MB image limit
    }))
    .mutation(async ({ input }) => {
      const client = createSupabaseAdminClient();
      try {
        // 1. Verify session exists
        const session = await getLatestPaymentSession(client, input.booking_id);
        if (!session || session.id !== input.session_id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment session not found.' });
        }
        // The session is the source of truth for which hotel this payment belongs to.
        // Reject a caller-supplied hotel_id that disagrees (defense in depth).
        if (input.hotel_id && input.hotel_id !== session.hotel_id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment session does not belong to the supplied hotel.' });
        }

        // 2. Lazy-expire the underlying booking first
        const expiredBooking = await expireBookingIfPast(client, session.booking_id);
        if (expiredBooking?.status === 'expired') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This payment window has expired.' });
        }

        // 3. Payment-session-level expiry check
        if (new Date() > new Date(session.expires_at)) {
          await updatePaymentSessionStatus(client, session.id, 'expired');
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Payment session has expired.' });
        }

        // 4. Fetch the booking's current lifecycle status
        const { data: booking, error: bookingError } = await client
          .from('bookings')
          .select('id,status')
          .eq('id', session.booking_id)
          .maybeSingle();
        if (bookingError) throw bookingError;
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        }
        const bookingStatus = booking.status as BookingStatus;

        // 5. Only bookings awaiting payment may attempt verification
        if (bookingStatus !== 'pending_payment' && bookingStatus !== 'payment_rejected') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This booking is not awaiting payment verification.',
          });
        }

        // 6. Move the booking into pending_verification. expires_at is cleared here —
        // manual review has no timer (spec: automated failures fall through to a human,
        // never auto-fail on a clock) and ALLOWED_TRANSITIONS has no
        // pending_verification -> expired edge. If a stale expires_at were left in place,
        // expireBookingIfPast's isExpired(pending_verification) check would still be true,
        // so its assertValidTransition(status, 'expired') call would throw instead of
        // no-op'ing on the next lazy-check — turning any later poll into a 500. It would
        // also make isBookingOccupyingInventory release the room mid-review, letting someone
        // else book it while a human is still looking at the slip. Setting expires_at to
        // null makes isExpired() false, so expireBookingIfPast is a safe no-op here.
        assertValidTransition(bookingStatus, 'pending_verification');
        const { error: toVerificationError } = await client
          .from('bookings')
          .update({ status: 'pending_verification', expires_at: null })
          .eq('id', session.booking_id);
        if (toVerificationError) throw toVerificationError;
        await logBookingStatusChange(client, {
          booking_id: session.booking_id,
          from_status: bookingStatus,
          to_status: 'pending_verification',
          reason: 'slip_submitted',
        });

        // 7. Hotel SlipOK config (hotel comes from the verified session, not the caller)
        const config = await getHotelPaymentConfig(client, session.hotel_id);
        if (!config?.slipok_key_enc || !config.slipok_branch_id || !config.slipok_enabled) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Slip verification is not available for this hotel. Please contact the hotel directly.',
          });
        }

        const apiKey = decryptSlipOkKey(config.slipok_key_enc);

        // 8. Call SlipOK
        try {
          const result = await verifySlipWithSlipOk(apiKey, config.slipok_branch_id, {
            slipData: input.slip_data,
            expectedAmount: Number(session.amount),
            ref: session.qr_reference,
          });

          if (result.matched) {
            const { duplicateRef } = await finalizePaymentSession(client, session.id, {
              status: 'paid',
              verifiedAt: new Date().toISOString(),
              rawResponse: result.raw,
              verifiedTransactionRef: result.transactionRef,
            });

            if (duplicateRef) {
              await logBookingStatusChange(client, {
                booking_id: session.booking_id,
                from_status: 'pending_verification',
                to_status: 'pending_verification',
                reason: 'duplicate_slip_ref',
              });
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'This slip has already been used to verify a different payment. Please contact the hotel.',
              });
            }

            assertValidTransition('pending_verification', 'confirmed');
            const { error: confirmError } = await client
              .from('bookings')
              .update({ status: 'confirmed' })
              .eq('id', session.booking_id);
            if (confirmError) throw confirmError;
            await updateBookingPaymentStatus(client, session.booking_id, 'verified');
            await logBookingStatusChange(client, {
              booking_id: session.booking_id,
              from_status: 'pending_verification',
              to_status: 'confirmed',
              reason: 'slipok_auto_verified',
            });
            return { verified: true as const, message: 'ชำระเงินสำเร็จ' };
          }

          // Definitive mismatch
          await finalizePaymentSession(client, session.id, {
            status: 'failed',
            rawResponse: result.raw,
          });
          assertValidTransition('pending_verification', 'payment_rejected');
          const { error: rejectError } = await client
            .from('bookings')
            .update({ status: 'payment_rejected' })
            .eq('id', session.booking_id);
          if (rejectError) throw rejectError;
          await updateBookingPaymentStatus(client, session.booking_id, 'failed');
          await logBookingStatusChange(client, {
            booking_id: session.booking_id,
            from_status: 'pending_verification',
            to_status: 'payment_rejected',
            reason: 'slipok_amount_or_ref_mismatch',
          });
          return { verified: false as const, message: 'ไม่พบการชำระเงินที่ตรงกัน กรุณาติดต่อที่พัก' };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          if (error instanceof SlipOkError) {
            if (error.code === 'API_ERROR') {
              await logBookingStatusChange(client, {
                booking_id: session.booking_id,
                from_status: 'pending_verification',
                to_status: 'pending_verification',
                reason: 'slipok_api_unavailable_manual_review_required',
              });
              return {
                verified: false as const,
                pendingManualReview: true as const,
                message: 'ระบบกำลังตรวจสอบสลิปของคุณ กรุณารอการยืนยันจากเจ้าหน้าที่',
              };
            }
            if (error.code === 'INVALID_KEY') {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'ระบบตรวจสลิปขัดข้อง กรุณาติดต่อที่พัก',
              });
            }
          }
          throw error;
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),

  /** Staff-only manual review of a slip that is awaiting verification. */
  manualVerify: protectedProcedure
    .input(z.object({
      booking_id: z.string().uuid(),
      hotel_id: z.string().uuid(),
      approved: z.boolean(),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
      const client = rlsClient(ctx.user.accessToken);
      try {
        const { data: booking, error } = await client
          .from('bookings')
          .select('id,hotel_id,status')
          .eq('id', input.booking_id)
          .eq('hotel_id', input.hotel_id)
          .maybeSingle();
        if (error) throw error;
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found.' });
        }

        const currentStatus = booking.status as BookingStatus;
        if (currentStatus !== 'pending_verification') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This booking is not awaiting manual verification.',
          });
        }

        const nextStatus: BookingStatus = input.approved ? 'confirmed' : 'payment_rejected';
        assertValidTransition('pending_verification', nextStatus);

        const { error: updateError } = await client
          .from('bookings')
          .update({ status: nextStatus })
          .eq('id', input.booking_id);
        if (updateError) throw updateError;

        await updateBookingPaymentStatus(client, input.booking_id, input.approved ? 'verified' : 'failed');
        await logBookingStatusChange(client, {
          booking_id: input.booking_id,
          from_status: 'pending_verification',
          to_status: nextStatus,
          changed_by: ctx.user.id,
          reason: input.note?.trim() || (input.approved ? 'manual_approve' : 'manual_reject'),
        });

        return { booking_id: input.booking_id, status: nextStatus };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return rethrowDomainError(error);
      }
    }),
});
