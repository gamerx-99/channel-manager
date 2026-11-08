import { describe, expect, it } from "vitest";
import { BOOKING_DOCUMENT_TYPES, calculateBookingDocumentAmounts, canIssueBookingQuotation, documentNumber } from "./bookingDocuments";

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

describe("booking document types and numbers", () => {
  it("offers the requested document types with a separate yearly number prefix", () => {
    expect(BOOKING_DOCUMENT_TYPES).toEqual(["quotation", "payment_receipt", "receipt", "tax_invoice"]);
    expect(documentNumber("quotation", 2026, 1)).toBe("QT-2026-000001");
    expect(documentNumber("payment_receipt", 2026, 1)).toBe("PR-2026-000001");
    expect(documentNumber("receipt", 2027, 1)).toBe("RC-2027-000001");
  });

  it("allows quotations before payment only while a booking is active", () => {
    expect(canIssueBookingQuotation({ status: "pending_payment" }, 100)).toBe(true);
    expect(canIssueBookingQuotation({ status: "pending_payment", expires_at: 100 }, 100)).toBe(true);
    expect(canIssueBookingQuotation({ status: "pending_payment", expires_at: 99 }, 100)).toBe(false);
    expect(canIssueBookingQuotation({ status: "confirmed" })).toBe(true);
    for (const status of ["cancelled", "expired", "payment_rejected", "refunded", "refund_pending"]) {
      expect(canIssueBookingQuotation({ status })).toBe(false);
    }
  });
});
