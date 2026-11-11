import { TRPCError } from "@trpc/server";
import { checkPromptPayIdForSave, normalisePromptPayId } from "../../shared/promptPayId";
import { and, desc, eq, ne } from "drizzle-orm";
import { bookings, hotelPaymentSettings, paymentSessions } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { moneyToSatang } from "../db/money";
import type { CreatePaymentSessionInput, PaymentSessionStatus, PaymentStatus } from "../db/types";

function canonicalAmount(value: string | number) {
  const satang = moneyToSatang(String(value));
  if (satang <= BigInt(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount must be positive." });
  return `${satang / BigInt(100)}.${String(satang % BigInt(100)).padStart(2, "0")}`;
}

export async function getSlipOkSettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.slipok.read", now);
  const [row] = await db.select({ keyHash: hotelPaymentSettings.slipokKeyHash, enabled: hotelPaymentSettings.slipokEnabled, branchId: hotelPaymentSettings.slipokBranchId })
    .from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
  if (!row) return { configured: false, enabled: false, branchId: null };
  return { configured: Boolean(row.keyHash), enabled: Boolean(row.enabled), branchId: row.branchId };
}

export async function saveSlipOkSettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, encryptedKey: string, keyHash: string, branchId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.slipok.save", now);
  await db.insert(hotelPaymentSettings).values({ hotelId, slipokKeyEnc: encryptedKey, slipokKeyHash: keyHash, slipokBranchId: branchId, slipokEnabled: true, updatedAt: now })
    .onConflictDoUpdate({ target: hotelPaymentSettings.hotelId, set: { slipokKeyEnc: encryptedKey, slipokKeyHash: keyHash, slipokBranchId: branchId, slipokEnabled: true, updatedAt: now } });
}

export async function removeSlipOkKey(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.slipok.remove", now);
  await db.insert(hotelPaymentSettings).values({ hotelId, slipokKeyEnc: null, slipokKeyHash: null, slipokBranchId: null, slipokEnabled: false, updatedAt: now })
    .onConflictDoUpdate({ target: hotelPaymentSettings.hotelId, set: { slipokKeyEnc: null, slipokKeyHash: null, slipokBranchId: null, slipokEnabled: false, updatedAt: now } });
}

/** Server-only; the result must never be returned from a procedure. */
export async function getSlipOkCredentialsForVerification(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "payment.slipok.verify_credentials", now);
  const [row] = await db.select({
    slipokKeyEnc: hotelPaymentSettings.slipokKeyEnc,
    slipokBranchId: hotelPaymentSettings.slipokBranchId,
  }).from(hotelPaymentSettings).where(and(
    eq(hotelPaymentSettings.hotelId, hotelId),
    eq(hotelPaymentSettings.slipokEnabled, true),
  )).limit(1);
  return row ? { slipok_key_enc: row.slipokKeyEnc, slipok_branch_id: row.slipokBranchId } : null;
}

export async function savePromptPaySettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, promptPayId: string, timeoutMinutes: number, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.promptpay.save", now);
  const checked = checkPromptPayIdForSave(promptPayId);
  if (!checked.ok) throw new TRPCError({ code: "BAD_REQUEST", message: checked.problem === "id_checksum" ? "Invalid PromptPay ID: the 13-digit ID number fails its check digit." : "Invalid PromptPay ID." });
  const normalised = { value: checked.value };
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 5 || timeoutMinutes > 60) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment timeout must be between 5 and 60 minutes." });
  await db.insert(hotelPaymentSettings).values({ hotelId, promptpayId: normalised.value, paymentTimeoutMinutes: timeoutMinutes, updatedAt: now })
    .onConflictDoUpdate({ target: hotelPaymentSettings.hotelId, set: { promptpayId: normalised.value, paymentTimeoutMinutes: timeoutMinutes, updatedAt: now } });
}

export async function getHotelPaymentConfig(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.config.read", now);
  const [row] = await db.select({
    promptpayId: hotelPaymentSettings.promptpayId,
    paymentTimeoutMinutes: hotelPaymentSettings.paymentTimeoutMinutes,
  }).from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
  if (!row) return null;
  return { promptpay_id: row.promptpayId, payment_timeout_minutes: row.paymentTimeoutMinutes };
}

/**
 * Whether the hotel has saved a PromptPay number and a SlipOK key. Booleans only, so it needs no 2FA
 * step-up (unlike getSlipOkSettings) and the reminder can ask on every page.
 */
export async function getPaymentSetupStatus(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.setup_status.read", now);
  const [row] = await db.select({
    promptpayId: hotelPaymentSettings.promptpayId,
    keyHash: hotelPaymentSettings.slipokKeyHash,
    branchId: hotelPaymentSettings.slipokBranchId,
    slipokEnabled: hotelPaymentSettings.slipokEnabled,
  }).from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
  return {
    promptpay_configured: Boolean(row?.promptpayId?.trim()),
    slipok_configured: Boolean(row?.keyHash && row.branchId && row.slipokEnabled),
  };
}

export async function getBookingRequestTimeout(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "booking_request.timeout.read", now);
  const [row] = await db.select({ hours: hotelPaymentSettings.bookingRequestTimeoutHours })
    .from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
  return { booking_request_timeout_hours: row?.hours ?? 24 };
}

export async function saveBookingRequestTimeout(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, hours: number, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "booking_request.timeout.save", now);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new TRPCError({ code: "BAD_REQUEST", message: "Booking request timeout must be between 1 and 168 hours." });
  await db.insert(hotelPaymentSettings).values({ hotelId, bookingRequestTimeoutHours: hours, updatedAt: now })
    .onConflictDoUpdate({ target: hotelPaymentSettings.hotelId, set: { bookingRequestTimeoutHours: hours, updatedAt: now } });
}

export async function createPaymentSession(db: D1ScopedDatabase, caller: D1CallerContext, input: CreatePaymentSessionInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_bookings", "payment_session.create", now);
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const expiresAt = new Date(input.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment expiry must be a valid date." });
  const [row] = await db.insert(paymentSessions).values({ bookingId: input.booking_id, hotelId: input.hotel_id, amount: canonicalAmount(input.amount), qrReference: input.qr_reference, qrString: input.qr_string, expiresAt }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment session insert returned no record." });
  return sessionRecord(row);
}

function sessionRecord(row: typeof paymentSessions.$inferSelect) {
  return { id: row.id, booking_id: row.bookingId, hotel_id: row.hotelId, amount: row.amount, status: row.status, qr_reference: row.qrReference, qr_string: row.qrString, expires_at: row.expiresAt.toISOString(), verified_at: row.verifiedAt?.toISOString() ?? null, slip_url: row.slipUrl, created_at: row.createdAt.toISOString() };
}

export async function getLatestPaymentSession(db: D1ScopedDatabase, caller: D1CallerContext, bookingId: string, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.view_bookings", "payment_session.read", now);
  const [row] = await db.select().from(paymentSessions).where(and(eq(paymentSessions.bookingId, bookingId), eq(paymentSessions.hotelId, hotelId))).orderBy(desc(paymentSessions.createdAt)).limit(1);
  return row ? sessionRecord(row) : null;
}

export async function updatePaymentSessionStatus(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, sessionId: string, status: PaymentSessionStatus, verifiedAt?: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "payment_session.update", now);
  const [row] = await db.update(paymentSessions).set({ status, ...(verifiedAt ? { verifiedAt: new Date(verifiedAt) } : {}) }).where(and(eq(paymentSessions.id, sessionId), eq(paymentSessions.hotelId, hotelId))).returning();
  return row ? sessionRecord(row) : null;
}

export async function savePaymentSessionSlip(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, sessionId: string, slipUrl: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "payment_session.save_slip", now);
  const [row] = await db.update(paymentSessions).set({ slipUrl })
    .where(and(eq(paymentSessions.id, sessionId), eq(paymentSessions.hotelId, hotelId)))
    .returning({ id: paymentSessions.id });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment session not found." });
}

/** Another session already verified with this bank transaction reference. */
async function transactionRefUsedElsewhere(db: D1ScopedDatabase, sessionId: string, ref: string) {
  const [row] = await db.select({ id: paymentSessions.id }).from(paymentSessions)
    .where(and(eq(paymentSessions.verifiedTransactionRef, ref), ne(paymentSessions.id, sessionId))).limit(1);
  return Boolean(row);
}

export async function finalizePaymentSession(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, sessionId: string, input: { status: PaymentSessionStatus; verifiedAt?: string; rawResponse: Record<string, unknown>; verifiedTransactionRef?: string | null }, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "payment_session.finalize", now);
  const ref = input.verifiedTransactionRef;
  // Checked across hotels on purpose: one slip pays for one booking anywhere on the platform.
  if (ref && await transactionRefUsedElsewhere(db, sessionId, ref)) return { duplicateRef: true };
  try {
    const [row] = await db.update(paymentSessions).set({ status: input.status, rawResponse: input.rawResponse, ...(input.verifiedAt ? { verifiedAt: new Date(input.verifiedAt) } : {}), ...(ref ? { verifiedTransactionRef: ref } : {}) })
      .where(and(eq(paymentSessions.id, sessionId), eq(paymentSessions.hotelId, hotelId))).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment session not found." });
    return { duplicateRef: false };
  } catch (error) {
    // A concurrent submit of the same slip can win between the check and the
    // write; the unique index then refuses ours. Drizzle wraps that error, so
    // look the reference up again instead of matching its message.
    if (ref && !(error instanceof TRPCError) && await transactionRefUsedElsewhere(db, sessionId, ref)) return { duplicateRef: true };
    throw error;
  }
}

/** Atomically stores verified full-payment evidence; a database trigger confirms the booking and logs the transition. */
export async function confirmManualFullPayment(db: D1ScopedDatabase, input: {
  hotelId: string; bookingId: string; sessionId: string; amountSatang: number; transactionReference: string; userId: string; reason: string; now: Date; rawResponse?: Record<string, unknown>;
}) {
  const toSatangSql = (column: string) => `CASE WHEN instr(${column}, '.') = 0 THEN CAST(${column} AS INTEGER) * 100 ELSE CAST(substr(${column}, 1, instr(${column}, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(${column}, instr(${column}, '.') + 1) || '00', 1, 2) AS INTEGER) END`;
  const sessionAmount = toSatangSql("s.amount");
  try {
    const result = await db.$client.batch([
      db.$client.prepare(`UPDATE payment_sessions AS s SET status = 'paid', verified_at = ?, verified_transaction_ref = ?, raw_response = ?, verified_by = ?, verified_reason = ?
        WHERE s.id = ? AND s.hotel_id = ? AND s.booking_id = ? AND s.status = 'pending'
          AND ${sessionAmount} = ?
          AND ${sessionAmount} = (SELECT CASE WHEN instr(b.price, '.') = 0 THEN CAST(b.price AS INTEGER) * 100 ELSE CAST(substr(b.price, 1, instr(b.price, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(b.price, instr(b.price, '.') + 1) || '00', 1, 2) AS INTEGER) END FROM bookings b WHERE b.id = s.booking_id AND b.hotel_id = s.hotel_id AND b.status = 'pending_verification')`)
        .bind(input.now.getTime(), input.transactionReference, input.rawResponse ? JSON.stringify(input.rawResponse) : null, input.userId, input.reason,
          input.sessionId, input.hotelId, input.bookingId, input.amountSatang),
    ]);
    return (result[0]?.meta.changes ?? 0) === 1;
  } catch (error) {
    const value = error as { message?: string; cause?: { message?: string } };
    const message = `${value?.message ?? ""} ${value?.cause?.message ?? ""}`;
    if (message.includes("idx_payment_sessions_verified_ref_unique")) {
      throw new TRPCError({ code: "CONFLICT", message: "This transaction reference has already been used." });
    }
    if (message.includes("verified payment must match a pending full booking")) {
      return false;
    }
    throw error;
  }
}

export async function updateBookingPaymentStatus(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, bookingId: string, paymentStatus: PaymentStatus, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "booking.payment_status.update", now);
  const [row] = await db.update(bookings).set({ paymentStatus }).where(and(eq(bookings.id, bookingId), eq(bookings.hotelId, hotelId))).returning({ id: bookings.id });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
}
