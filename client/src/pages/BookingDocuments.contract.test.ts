import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("receipts and tax invoices contract", () => {
  const router = read("server/routers.ts");
  const bookings = read("client/src/pages/Bookings.tsx");
  const hotelDetail = read("client/src/pages/HotelDetail.tsx");
  const dialog = read("client/src/components/booking/BookingDocumentDialog.tsx");
  const settings = read("client/src/components/hotel/HotelInvoiceSettings.tsx");

  it("registers the router", () => {
    expect(router).toContain("bookingDocuments: bookingDocumentsRouter");
  });

  it("puts the bill header on the hotel settings page behind the profile permission", () => {
    expect(hotelDetail).toContain("{canPublish && <HotelInvoiceSettings");
    expect(hotelDetail).toContain("'property.manage_profile'");
    expect(settings).toContain('id="invoice-tax-id"');
    expect(settings).toContain('id="invoice-enabled"');
  });

  it("offers quotations before payment and receipts for paid bookings to staff who manage bookings", () => {
    expect(bookings).toContain("'operations.manage_bookings'");
    expect(bookings).toContain("canIssueDocuments && (canIssueBookingDocument(booking) || canIssueBookingQuotation(booking))");
    expect(bookings).toContain("<BookingDocumentDialog");
    expect(dialog).toContain("bookingDocuments.typeQuotation");
    expect(dialog).toContain("bookingDocuments.typePaymentReceipt");
    expect(dialog).toContain('id="document-payment-method"');
    expect(dialog).toContain('id="document-issue"');
    expect(dialog).toContain("bookingDocuments.printAgain");
  });
});
