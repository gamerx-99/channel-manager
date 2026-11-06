import { TRPCError } from "@trpc/server";
import { and, desc, eq, max } from "drizzle-orm";
import {
  calculateBookingDocumentAmounts, canIssueBookingDocument, documentNumber,
  type BookingDocumentSnapshot, type BookingDocumentType, type DocumentParty,
} from "@shared/bookingDocuments";
import { bangkokDate, toSatang } from "@shared/finance";
import { bookingDocuments, bookings, hotelInvoiceSettings, roomTypes, rooms } from "../../drizzle/d1-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

export type InvoiceSettingsInput = {
  enabled: boolean; issuerName: string; address: string; taxId: string | null; branch: string | null; phone: string | null;
  vatEnabled: boolean; vatRate: number; withholdingEnabled: boolean; withholdingRate: number;
};

/** Not secret: everything here is printed on the hotel's own documents. */
export async function getInvoiceSettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.view", "invoice_settings.read", now);
  const [row] = await db.select().from(hotelInvoiceSettings).where(eq(hotelInvoiceSettings.hotelId, hotelId)).limit(1);
  return row ?? null;
}

export async function saveInvoiceSettings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, input: InvoiceSettingsInput, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "invoice_settings.update", now);
  const values = { ...input, updatedAt: now };
  await db.insert(hotelInvoiceSettings).values({ hotelId, ...values })
    .onConflictDoUpdate({ target: hotelInvoiceSettings.hotelId, set: values });
  return { success: true as const };
}

export async function listBookingDocuments(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, bookingId: string, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "operations.view_bookings", "booking_documents.read", now);
  const rows = await db.select({ id: bookingDocuments.id, snapshot: bookingDocuments.snapshot, createdAt: bookingDocuments.createdAt })
    .from(bookingDocuments)
    .where(and(eq(bookingDocuments.hotelId, hotelId), eq(bookingDocuments.bookingId, bookingId)))
    .orderBy(desc(bookingDocuments.createdAt));
  return rows;
}

export async function issueBookingDocument(
  db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string,
  input: { bookingId: string; type: BookingDocumentType; buyer: DocumentParty }, now = new Date(),
) {
  await authorizeHotelAction(db, caller, hotelId, "operations.manage_bookings", "booking_documents.issue", now);
  const [settings] = await db.select().from(hotelInvoiceSettings).where(eq(hotelInvoiceSettings.hotelId, hotelId)).limit(1);
  if (!settings?.enabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Turn on documents and set the header first." });
  if (input.type === "tax_invoice" && !settings.taxId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A tax invoice needs the hotel's tax ID." });
  }
  if (input.type === "tax_invoice" && !input.buyer.address) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A tax invoice needs the buyer's address." });
  }

  const [booking] = await db.select({
    id: bookings.id, status: bookings.status, paymentStatus: bookings.paymentStatus, paymentMethod: bookings.paymentMethod,
    checkIn: bookings.checkIn, checkOut: bookings.checkOut, price: bookings.price, roomType: roomTypes.name,
  }).from(bookings)
    .leftJoin(rooms, eq(bookings.roomId, rooms.id))
    .leftJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.hotelId, hotelId))).limit(1);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  if (!canIssueBookingDocument({ status: booking.status, payment_status: booking.paymentStatus })) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a paid booking that still stands gets a document." });
  }

  const amounts = calculateBookingDocumentAmounts(toSatang(booking.price), {
    vatEnabled: settings.vatEnabled, vatRate: settings.vatRate,
    withholdingEnabled: settings.withholdingEnabled, withholdingRate: settings.withholdingRate,
  }, true);
  const nights = Math.round((Date.parse(booking.checkOut) - Date.parse(booking.checkIn)) / 86_400_000);
  const base: Omit<BookingDocumentSnapshot, "number"> = {
    type: input.type,
    issuedOn: bangkokDate(now),
    issuer: { name: settings.issuerName, address: settings.address, taxId: settings.taxId, branch: settings.branch, phone: settings.phone },
    buyer: input.buyer,
    booking: { id: booking.id, checkIn: booking.checkIn, checkOut: booking.checkOut, nights, roomType: booking.roomType, paymentMethod: booking.paymentMethod },
    ...amounts,
    vatEnabled: settings.vatEnabled,
    vatRate: settings.vatRate,
    withholdingEnabled: settings.withholdingEnabled,
    withholdingRate: settings.withholdingRate,
  };

  // Two staff issuing at once can read the same last number; the unique index refuses the
  // second insert, so it reads again and takes the next number.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [last] = await db.select({ seq: max(bookingDocuments.seq) }).from(bookingDocuments)
      .where(and(eq(bookingDocuments.hotelId, hotelId), eq(bookingDocuments.docType, input.type)));
    const seq = (last?.seq ?? 0) + 1;
    const snapshot: BookingDocumentSnapshot = { ...base, number: documentNumber(input.type, seq) };
    try {
      await db.insert(bookingDocuments).values({
        hotelId, bookingId: booking.id, docType: input.type, seq, docNumber: snapshot.number, snapshot,
        issuedBy: caller.userId ?? null, createdAt: now,
      });
      return snapshot;
    } catch (error) {
      const failure = error as { message?: string; cause?: { message?: string } };
      if (!`${failure?.message} ${failure?.cause?.message}`.includes("UNIQUE")) throw error;
    }
  }
  throw new TRPCError({ code: "CONFLICT", message: "Could not take a document number. Try again." });
}
