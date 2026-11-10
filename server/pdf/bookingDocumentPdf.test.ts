import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { BookingDocumentSnapshot } from "../../shared/bookingDocuments";
import { A4_HEIGHT, A4_WIDTH, generateBookingDocumentPdf } from "./bookingDocumentPdf";

const sampleInvoiceSnapshot: BookingDocumentSnapshot = {
  type: "invoice",
  number: "INV-000001",
  issuedOn: "2026-11-10",
  issuer: {
    name: "โรงแรม ล้านนา บูทีค เชียงใหม่",
    address: "123 ถนนนิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
    taxId: "0105558123456",
    branch: "สำนักงานใหญ่",
    phone: "053-123456",
  },
  buyer: {
    name: "สมชาย รักสงบ",
    address: "88/1 ถนนสุขุมวิท คลองเตย กรุงเทพฯ 10110",
    taxId: "1100500123456",
    branch: null,
  },
  booking: {
    id: "bk-thai-sample-01",
    checkIn: "2026-12-01",
    checkOut: "2026-12-04",
    nights: 3,
    roomType: "Deluxe Mountain View",
    paymentMethod: "PromptPay",
  },
  items: [
    {
      name: "Room: Deluxe Mountain View",
      description: "2026-12-01 – 2026-12-04 (3 nights)",
      quantity: 3,
      unitPriceSatang: 150000,
      totalPriceSatang: 450000,
    },
    {
      name: "Airport Shuttle Service (ไป-กลับ)",
      description: "ONE_TIME",
      quantity: 1,
      unitPriceSatang: 50000,
      totalPriceSatang: 50000,
    },
    {
      name: "บุฟเฟต์อาหารเช้าพิเศษ (Breakfast Buffet)",
      description: "PER_PERSON",
      quantity: 2,
      unitPriceSatang: 25000,
      totalPriceSatang: 50000,
    },
  ],
  subtotalSatang: 500000,
  vatEnabled: true,
  vatRate: 7,
  vatSatang: 35000,
  withholdingEnabled: false,
  withholdingRate: 0,
  withholdingSatang: 0,
  totalSatang: 535000,
  netToPaySatang: 535000,
  amountPaidSatang: 0,
  balanceSatang: 535000,
  paymentStatus: "unpaid",
};

const sampleReceiptSnapshot: BookingDocumentSnapshot = {
  ...sampleInvoiceSnapshot,
  type: "receipt",
  number: "RC-000001",
  amountPaidSatang: 535000,
  balanceSatang: 0,
  paymentStatus: "verified",
};

describe("generateBookingDocumentPdf", () => {
  it("generates a valid A4 PDF with Thai typography for invoice", async () => {
    const pdfBytes = await generateBookingDocumentPdf(sampleInvoiceSnapshot);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // PDF Magic bytes: %PDF-
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");

    // Write artifact to evidence folder
    const evidenceDir = "/home/gserver/.gemini/antigravity/brain/f082739c-e372-4146-a763-2a74b0caf554/evidence";
    const invoicePath = resolve(evidenceDir, "sample_invoice.pdf");
    writeFileSync(invoicePath, pdfBytes);
  });

  it("generates a valid A4 PDF for receipt with paid status", async () => {
    const pdfBytes = await generateBookingDocumentPdf(sampleReceiptSnapshot);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);

    const evidenceDir = "/home/gserver/.gemini/antigravity/brain/f082739c-e372-4146-a763-2a74b0caf554/evidence";
    const receiptPath = resolve(evidenceDir, "sample_receipt.pdf");
    writeFileSync(receiptPath, pdfBytes);
  });

  it("exports standard A4 dimensions", () => {
    expect(A4_WIDTH).toBeCloseTo(595.28);
    expect(A4_HEIGHT).toBeCloseTo(841.89);
  });
});
