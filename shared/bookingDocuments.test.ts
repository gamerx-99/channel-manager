import { describe, expect, it } from "vitest";
import { calculateBookingDocumentAmounts, canIssueBookingDocument, documentNumber } from "./bookingDocuments";

const off = { vatEnabled: false, vatRate: 7, withholdingEnabled: false, withholdingRate: 3 };

describe("booking document tax calculation", () => {
  it("leaves the price unchanged when both taxes are off", () => {
    expect(calculateBookingDocumentAmounts(100000, off)).toEqual({ subtotalSatang: 100000, vatSatang: 0, totalSatang: 100000, withholdingSatang: 0, netToPaySatang: 100000 });
  });
  it("adds VAT to the base price and splits it from a VAT-inclusive price", () => {
    expect(calculateBookingDocumentAmounts(100000, { ...off, vatEnabled: true })).toEqual({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000, withholdingSatang: 0, netToPaySatang: 107000 });
    expect(calculateBookingDocumentAmounts(107000, { ...off, vatEnabled: true }, true)).toMatchObject({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000 });
  });
  it("deducts withholding from the price when VAT is off", () => {
    expect(calculateBookingDocumentAmounts(100000, { ...off, withholdingEnabled: true })).toEqual({ subtotalSatang: 100000, vatSatang: 0, totalSatang: 100000, withholdingSatang: 3000, netToPaySatang: 97000 });
  });
  it("calculates withholding on the pre-VAT subtotal", () => {
    expect(calculateBookingDocumentAmounts(100000, { vatEnabled: true, vatRate: 7, withholdingEnabled: true, withholdingRate: 3 })).toEqual({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000, withholdingSatang: 3000, netToPaySatang: 104000 });
  });
});

describe("document numbers", () => {
  it("prefixes running numbers by document type", () => {
    expect(documentNumber("invoice", 1)).toBe("INV-000001");
    expect(documentNumber("receipt", 42)).toBe("RC-000042");
    expect(documentNumber("tax_invoice", 999)).toBe("TX-000999");
  });
});

describe("canIssueBookingDocument", () => {
  it("allows invoices for active bookings regardless of payment status", () => {
    expect(canIssueBookingDocument({ status: "confirmed", payment_status: "unpaid" }, "invoice")).toBe(true);
    expect(canIssueBookingDocument({ status: "pending_payment", payment_status: "unpaid" }, "invoice")).toBe(true);
    expect(canIssueBookingDocument({ status: "held", payment_status: "unpaid" }, "invoice")).toBe(true);
    expect(canIssueBookingDocument({ status: "checked_in", payment_status: "verified" }, "invoice")).toBe(true);
    // Disallowed statuses
    expect(canIssueBookingDocument({ status: "cancelled", payment_status: "unpaid" }, "invoice")).toBe(false);
    expect(canIssueBookingDocument({ status: "expired", payment_status: "unpaid" }, "invoice")).toBe(false);
    expect(canIssueBookingDocument({ status: "payment_rejected", payment_status: "unpaid" }, "invoice")).toBe(false);
  });

  it("strictly requires revenue status and verified payment for receipts and tax invoices", () => {
    expect(canIssueBookingDocument({ status: "confirmed", payment_status: "verified" }, "receipt")).toBe(true);
    expect(canIssueBookingDocument({ status: "confirmed", payment_status: "verified" }, "tax_invoice")).toBe(true);
    expect(canIssueBookingDocument({ status: "confirmed", payment_status: "unpaid" }, "receipt")).toBe(false);
    expect(canIssueBookingDocument({ status: "cancelled", payment_status: "verified" }, "receipt")).toBe(false);
    expect(canIssueBookingDocument({ status: "pending_payment", payment_status: "pending" }, "receipt")).toBe(false);
  });
});

