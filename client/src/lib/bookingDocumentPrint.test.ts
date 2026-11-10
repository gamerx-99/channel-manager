import { describe, expect, it } from "vitest";
import { calculateBookingDocumentAmounts, type BookingDocumentSnapshot } from "@shared/bookingDocuments";
import { issueFormProblem } from "@/components/booking/useBookingDocuments";
import { buildBookingDocumentHtml, formatDocumentDate, type BookingDocumentLabels } from "./bookingDocumentPrint";
import th from "./i18n/th";
import en from "./i18n/en";

const labels = th.bookingDocuments.print as unknown as BookingDocumentLabels;
const englishLabels = en.bookingDocuments.print as unknown as BookingDocumentLabels;
const receipt: BookingDocumentSnapshot = {
  type: "receipt", number: "RC-000001", issuedOn: "2026-11-07",
  issuer: { name: "Hotel <b>", address: "1 Road", taxId: "0105555555555", branch: "สำนักงานใหญ่", phone: "053000000" },
  buyer: { name: "<script>alert(1)</script>", address: null, taxId: null, branch: null },
  booking: { id: "abcdef12-0000", checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, roomType: "Deluxe", paymentMethod: "promptpay" },
  subtotalSatang: 107000, vatEnabled: false, vatRate: 7, vatSatang: 0, totalSatang: 107000, withholdingEnabled: false, withholdingRate: 3, withholdingSatang: 0, netToPaySatang: 107000,
};

describe("booking document print page", () => {
  it("escapes typed values and shows the number, total and payment method", () => {
    const html = buildBookingDocumentHtml(receipt, labels, "th", "พร้อมเพย์");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Hotel &lt;b&gt;");
    expect(html).toContain("RC-000001");
    expect(html).toContain("1,070.00");
    expect(html).toContain("ชำระโดย พร้อมเพย์");
    expect(html).toContain("@page { size: A4");
    expect(html).not.toContain(labels.vat);
  });

  it("renders annual document numbers like INV-2026-000001 and RC-2026-000001 correctly", () => {
    const annualReceipt = { ...receipt, number: "RC-2026-000001", year: 2026 };
    const htmlReceipt = buildBookingDocumentHtml(annualReceipt, labels, "th", "พร้อมเพย์");
    expect(htmlReceipt).toContain("RC-2026-000001");

    const annualInvoice = { ...receipt, type: "invoice" as const, number: "INV-2026-000001", year: 2026 };
    const htmlInvoice = buildBookingDocumentHtml(annualInvoice, labels, "th", null);
    expect(htmlInvoice).toContain("INV-2026-000001");
  });

  it("shows configured VAT lines only when VAT is enabled", () => {
    const html = buildBookingDocumentHtml({ ...receipt, type: "tax_invoice", vatEnabled: true, ...calculateBookingDocumentAmounts(107000, { vatEnabled: true, vatRate: 7, withholdingEnabled: false, withholdingRate: 3 }, true) }, labels, "th", null);
    expect(html).toContain("ใบกำกับภาษี/ใบเสร็จรับเงิน");
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 7%");
    expect(html).toContain("1,000.00");
    expect(html).toContain("70.00");
  });

  it("renders withholding and net to pay from the issued snapshot", () => {
    const html = buildBookingDocumentHtml({
      ...receipt, vatEnabled: true, vatRate: 7, vatSatang: 7000, subtotalSatang: 100000,
      totalSatang: 107000, withholdingEnabled: true, withholdingRate: 3, withholdingSatang: 3000, netToPaySatang: 104000,
    }, englishLabels, "en", null);
    expect(html).toContain("VAT 7%");
    expect(html).toContain("Withholding 3%");
    expect(html).toContain("Net to pay");
    expect(html).toContain("1,040.00");
  });

  it("keeps the amounts of already issued VAT snapshots printable", () => {
    const oldSnapshot = { ...receipt, subtotalSatang: undefined, vatEnabled: undefined, vatRate: undefined, vatSatang: 7000, netSatang: 100000 } as unknown as BookingDocumentSnapshot;
    const html = buildBookingDocumentHtml(oldSnapshot, englishLabels, "en", null);
    expect(html).toContain("Subtotal");
    expect(html).toContain("VAT</td>");
    expect(html).toContain("1,000.00");
    expect(html).toContain("70.00");
    expect(html).not.toContain("NaN");
  });

  it("shows the Buddhist year to Thai readers", () => {
    expect(formatDocumentDate("2026-11-07", "th")).toContain("2569");
    expect(formatDocumentDate("2026-11-07", "en")).toContain("2026");
  });

  it("renders an itemized invoice with room, services, and balance due", () => {
    const invoiceDoc: BookingDocumentSnapshot = {
      type: "invoice",
      number: "INV-000001",
      issuedOn: "2026-11-07",
      issuer: { name: "Lanna Resort", address: "123 Chiang Mai", taxId: "0105555555555", branch: "Main", phone: "053123456" },
      buyer: { name: "Somchai Jaidee", address: null, taxId: null, branch: null },
      booking: { id: "bk-9999-0000", checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, roomType: "Deluxe Suite", paymentMethod: null },
      items: [
        { name: "Room: Deluxe Suite", description: "2026-12-01 – 2026-12-03 (2 nights)", quantity: 2, unitPriceSatang: 100000, totalPriceSatang: 200000 },
        { name: "Airport Transfer", description: "ONE_TIME", quantity: 1, unitPriceSatang: 50000, totalPriceSatang: 50000 },
      ],
      subtotalSatang: 250000,
      vatEnabled: false,
      vatRate: 7,
      vatSatang: 0,
      totalSatang: 250000,
      withholdingEnabled: false,
      withholdingRate: 3,
      withholdingSatang: 0,
      netToPaySatang: 250000,
      amountPaidSatang: 0,
      balanceSatang: 250000,
      paymentStatus: "unpaid",
    };

    const htmlTh = buildBookingDocumentHtml(invoiceDoc, labels, "th", null);
    expect(htmlTh).toContain("ใบแจ้งชำระเงิน");
    expect(htmlTh).toContain("INV-000001");
    expect(htmlTh).toContain("Room: Deluxe Suite");
    expect(htmlTh).toContain("Airport Transfer");
    expect(htmlTh).toContain("2,000.00");
    expect(htmlTh).toContain("500.00");
    expect(htmlTh).toContain("ยอดค้างชำระ");
    expect(htmlTh).toContain("2,500.00");

    const htmlEn = buildBookingDocumentHtml(invoiceDoc, englishLabels, "en", null);
    expect(htmlEn).toContain("Invoice");
    expect(htmlEn).toContain("INV-000001");
    expect(htmlEn).toContain("Balance due");
  });
});

describe("issue form rules", () => {
  const form = { name: "Guest", address: "", taxId: "" };
  it("allows a receipt and invoice with only a name", () => {
    expect(issueFormProblem("receipt", form, false)).toBeNull();
    expect(issueFormProblem("invoice", form, false)).toBeNull();
  });
  it("needs a name, a 13-digit tax ID if typed, the hotel tax ID and an address for a tax invoice", () => {
    expect(issueFormProblem("receipt", { ...form, name: " " }, true)).toBe("name");
    expect(issueFormProblem("invoice", { ...form, name: " " }, true)).toBe("name");
    expect(issueFormProblem("receipt", { ...form, taxId: "123" }, true)).toBe("taxId");
    expect(issueFormProblem("invoice", { ...form, taxId: "123" }, true)).toBe("taxId");
    expect(issueFormProblem("tax_invoice", form, false)).toBe("hotelTaxId");
    expect(issueFormProblem("tax_invoice", form, true)).toBe("address");
    expect(issueFormProblem("tax_invoice", { ...form, address: "2 Road" }, true)).toBeNull();
  });
});
