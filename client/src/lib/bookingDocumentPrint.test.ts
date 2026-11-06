import { describe, expect, it } from "vitest";
import { splitVatSatang, type BookingDocumentSnapshot } from "@shared/bookingDocuments";
import { issueFormProblem } from "@/components/booking/useBookingDocuments";
import { buildBookingDocumentHtml, formatDocumentDate, type BookingDocumentLabels } from "./bookingDocumentPrint";
import th from "./i18n/th";

const labels = th.bookingDocuments.print as unknown as BookingDocumentLabels;
const receipt: BookingDocumentSnapshot = {
  type: "receipt", number: "RC-000001", issuedOn: "2026-11-07",
  issuer: { name: "Hotel <b>", address: "1 Road", taxId: "0105555555555", branch: "สำนักงานใหญ่", phone: "053000000" },
  buyer: { name: "<script>alert(1)</script>", address: null, taxId: null, branch: null },
  booking: { id: "abcdef12-0000", checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, roomType: "Deluxe", paymentMethod: "promptpay" },
  totalSatang: 107000, vatSatang: null, netSatang: null,
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

  it("shows VAT lines only on a tax invoice", () => {
    const html = buildBookingDocumentHtml({ ...receipt, type: "tax_invoice", ...splitVatSatang(107000) }, labels, "th", null);
    expect(html).toContain("ใบกำกับภาษี/ใบเสร็จรับเงิน");
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 7%");
    expect(html).toContain("1,000.00");
    expect(html).toContain("70.00");
  });

  it("shows the Buddhist year to Thai readers", () => {
    expect(formatDocumentDate("2026-11-07", "th")).toContain("2569");
    expect(formatDocumentDate("2026-11-07", "en")).toContain("2026");
  });
});

describe("VAT split", () => {
  it("takes 7% VAT out of an inclusive total and keeps every satang", () => {
    expect(splitVatSatang(107000)).toEqual({ netSatang: 100000, vatSatang: 7000 });
    const odd = splitVatSatang(99999);
    expect(odd.netSatang + odd.vatSatang).toBe(99999);
  });
});

describe("issue form rules", () => {
  const form = { name: "Guest", address: "", taxId: "" };
  it("allows a receipt with only a name", () => {
    expect(issueFormProblem("receipt", form, false)).toBeNull();
  });
  it("needs a name, a 13-digit tax ID if typed, the hotel tax ID and an address for a tax invoice", () => {
    expect(issueFormProblem("receipt", { ...form, name: " " }, true)).toBe("name");
    expect(issueFormProblem("receipt", { ...form, taxId: "123" }, true)).toBe("taxId");
    expect(issueFormProblem("tax_invoice", form, false)).toBe("hotelTaxId");
    expect(issueFormProblem("tax_invoice", form, true)).toBe("address");
    expect(issueFormProblem("tax_invoice", { ...form, address: "2 Road" }, true)).toBeNull();
  });
});
