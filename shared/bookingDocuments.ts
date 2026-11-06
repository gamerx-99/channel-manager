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

export type BookingDocumentTaxSettings = { vatEnabled: boolean; vatRate: number; withholdingEnabled: boolean; withholdingRate: number };
export type BookingDocumentAmounts = {
  subtotalSatang: number; vatSatang: number; totalSatang: number; withholdingSatang: number; netToPaySatang: number;
};

/** Prices paid by guests include VAT when enabled. Every printed amount is rounded to satang. */
export function calculateBookingDocumentAmounts(priceSatang: number, settings: BookingDocumentTaxSettings, priceIncludesVat = false): BookingDocumentAmounts {
  const subtotalSatang = settings.vatEnabled && priceIncludesVat
    ? Math.round(priceSatang * 100 / (100 + settings.vatRate))
    : Math.round(priceSatang);
  const vatSatang = settings.vatEnabled ? Math.round(subtotalSatang * settings.vatRate / 100) : 0;
  const totalSatang = priceIncludesVat && settings.vatEnabled ? Math.round(priceSatang) : subtotalSatang + vatSatang;
  const withholdingSatang = settings.withholdingEnabled ? Math.round(subtotalSatang * settings.withholdingRate / 100) : 0;
  return { subtotalSatang, vatSatang, totalSatang, withholdingSatang, netToPaySatang: totalSatang - withholdingSatang };
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
  subtotalSatang: number;
  vatEnabled: boolean;
  vatRate: number;
  vatSatang: number;
  totalSatang: number;
  withholdingEnabled: boolean;
  withholdingRate: number;
  withholdingSatang: number;
  netToPaySatang: number;
};

export const TAX_ID_PATTERN = /^\d{13}$/;
