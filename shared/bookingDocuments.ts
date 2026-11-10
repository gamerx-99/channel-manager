import { bangkokDate, isRevenueStatus } from "./finance";

/**
 * Documents a hotel issues from a booking:
 * - invoice (ใบแจ้งชำระเงิน): for pending or active bookings needing payment
 * - receipt (ใบเสร็จรับเงิน): issued only after payment is verified
 * - tax_invoice (ใบกำกับภาษี): issued on request with full tax ID and address
 */
export const BOOKING_DOCUMENT_TYPES = ["invoice", "receipt", "tax_invoice"] as const;
export type BookingDocumentType = (typeof BOOKING_DOCUMENT_TYPES)[number];

const NUMBER_PREFIX: Record<BookingDocumentType, string> = { invoice: "INV", receipt: "RC", tax_invoice: "TX" };

/**
 * Current Gregorian calendar year in Bangkok timezone (UTC+7).
 * Thailand observes UTC+7 with no daylight saving time; the sequence resets
 * automatically at 00:00:00 on January 1st Asia/Bangkok time.
 */
export function bangkokYear(now: Date = new Date()): number {
  return Number(bangkokDate(now).slice(0, 4));
}

export function documentNumber(type: BookingDocumentType, seq: number, year?: number): string {
  if (year !== undefined) {
    return `${NUMBER_PREFIX[type]}-${year}-${String(seq).padStart(6, "0")}`;
  }
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

/**
 * Money must have been received for receipts and tax invoices.
 * Invoices can be issued for any active booking that is not cancelled or expired.
 * When type is omitted, checks whether any document can be issued for the booking.
 */
export function canIssueBookingDocument(
  booking: { status: string; payment_status?: string | null; paymentStatus?: string | null },
  type?: BookingDocumentType,
): boolean {
  const paymentStatus = booking.payment_status ?? booking.paymentStatus;
  if (type === "receipt" || type === "tax_invoice") {
    return isRevenueStatus(booking.status) && paymentStatus === "verified";
  }
  if (type === "invoice") {
    return !["cancelled", "expired", "payment_rejected"].includes(booking.status);
  }
  return !["cancelled", "expired", "payment_rejected"].includes(booking.status);
}

export type DocumentParty = { name: string; address: string | null; taxId: string | null; branch: string | null };

export type BookingDocumentItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceSatang: number;
  totalPriceSatang: number;
};

/** What was printed, kept as issued so later edits to the hotel or booking never change it. */
export type BookingDocumentSnapshot = {
  type: BookingDocumentType;
  number: string;
  year?: number;
  idempotencyKey?: string | null;
  /** Thai calendar date, YYYY-MM-DD. */
  issuedOn: string;
  issuer: DocumentParty & { phone: string | null };
  buyer: DocumentParty;
  booking: { id: string; checkIn: string; checkOut: string; nights: number; roomType: string | null; paymentMethod: string | null };
  items?: BookingDocumentItem[];
  subtotalSatang: number;
  vatEnabled: boolean;
  vatRate: number;
  vatSatang: number;
  totalSatang: number;
  withholdingEnabled: boolean;
  withholdingRate: number;
  withholdingSatang: number;
  netToPaySatang: number;
  amountPaidSatang?: number;
  balanceSatang?: number;
  paymentStatus?: string | null;
};

export const TAX_ID_PATTERN = /^\d{13}$/;
