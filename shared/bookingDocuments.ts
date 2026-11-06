import { isRevenueStatus } from "./finance";

/**
 * Receipts and tax invoices a hotel issues from a booking (DECISIONS 2026-11-06: the hotel is the
 * issuer, printed or saved as PDF at the hotel; no e-Tax Invoice).
 */
export const BOOKING_DOCUMENT_TYPES = ["receipt", "tax_invoice"] as const;
export type BookingDocumentType = (typeof BOOKING_DOCUMENT_TYPES)[number];

// ASSUMPTION: one running number per hotel and document type that never resets, e.g. RC-000001.
const NUMBER_PREFIX: Record<BookingDocumentType, string> = { receipt: "RC", tax_invoice: "TX" };

export function documentNumber(type: BookingDocumentType, seq: number): string {
  return `${NUMBER_PREFIX[type]}-${String(seq).padStart(6, "0")}`;
}

// ASSUMPTION: Thai VAT is 7% and booking prices already include it. The hotel's accountant confirms.
export const VAT_RATE_PERCENT = 7;

/** The VAT part of a VAT-inclusive total, rounded to the nearest satang. */
export function splitVatSatang(totalSatang: number): { netSatang: number; vatSatang: number } {
  const vatSatang = Math.round((totalSatang * VAT_RATE_PERCENT) / (100 + VAT_RATE_PERCENT));
  return { netSatang: totalSatang - vatSatang, vatSatang };
}

/** Money must have been received: a receipt records a payment, and a cancelled booking is not revenue. */
export function canIssueBookingDocument(booking: { status: string; payment_status?: string | null }): boolean {
  return isRevenueStatus(booking.status) && booking.payment_status === "verified";
}

export type DocumentParty = { name: string; address: string | null; taxId: string | null; branch: string | null };

/** What was printed, kept as issued so later edits to the hotel or booking never change it. */
export type BookingDocumentSnapshot = {
  type: BookingDocumentType;
  number: string;
  /** Thai calendar date, YYYY-MM-DD. */
  issuedOn: string;
  issuer: DocumentParty & { phone: string | null };
  buyer: DocumentParty;
  booking: { id: string; checkIn: string; checkOut: string; nights: number; roomType: string | null; paymentMethod: string | null };
  totalSatang: number;
  vatSatang: number | null;
  netSatang: number | null;
};

export const TAX_ID_PATTERN = /^\d{13}$/;
