import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
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

export async function savePromptPaySettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, promptPayId: string, timeoutMinutes: number, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.promptpay.save", now);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 5 || timeoutMinutes > 60) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment timeout must be between 5 and 60 minutes." });
  await db.insert(hotelPaymentSettings).values({ hotelId, promptpayId: promptPayId, paymentTimeoutMinutes: timeoutMinutes, updatedAt: now })
    .onConflictDoUpdate({ target: hotelPaymentSettings.hotelId, set: { promptpayId: promptPayId, paymentTimeoutMinutes: timeoutMinutes, updatedAt: now } });
}

export async function getHotelPaymentConfig(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "payment.config.read", now);
  const [row] = await db.select().from(hotelPaymentSettings).where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
  if (!row) return null;
  return { promptpay_id: row.promptpayId, slipok_key_enc: row.slipokKeyEnc, slipok_branch_id: row.slipokBranchId, slipok_enabled: row.slipokEnabled, payment_timeout_minutes: row.paymentTimeoutMinutes };
}

export async function createPaymentSession(db: D1ScopedDatabase, caller: D1CallerContext, input: CreatePaymentSessionInput, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "operations.manage_bookings", "payment_session.create", now);
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, input.booking_id), eq(bookings.hotelId, input.hotel_id))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const [row] = await db.insert(paymentSessions).values({ bookingId: input.booking_id, hotelId: input.hotel_id, amount: canonicalAmount(input.amount), qrReference: input.qr_reference, qrString: input.qr_string, expiresAt: new Date(input.expires_at) }).returning();
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

export async function finalizePaymentSession(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, sessionId: string, input: { status: PaymentSessionStatus; verifiedAt?: string; rawResponse: Record<string, unknown>; verifiedTransactionRef?: string | null }, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "payment_session.finalize", now);
  try {
    const [row] = await db.update(paymentSessions).set({ status: input.status, rawResponse: input.rawResponse, ...(input.verifiedAt ? { verifiedAt: new Date(input.verifiedAt) } : {}), ...(input.verifiedTransactionRef ? { verifiedTransactionRef: input.verifiedTransactionRef } : {}) })
      .where(and(eq(paymentSessions.id, sessionId), eq(paymentSessions.hotelId, hotelId))).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment session not found." });
    return { duplicateRef: false };
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message) && input.verifiedTransactionRef) return { duplicateRef: true };
    throw error;
  }
}

export async function updateBookingPaymentStatus(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, bookingId: string, paymentStatus: PaymentStatus, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "booking.payment_status.update", now);
  const [row] = await db.update(bookings).set({ paymentStatus }).where(and(eq(bookings.id, bookingId), eq(bookings.hotelId, hotelId))).returning({ id: bookings.id });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
}
