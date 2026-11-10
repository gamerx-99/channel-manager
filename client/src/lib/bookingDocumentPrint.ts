import { escapeHtml } from "@shared/escapeHtml";
import { type BookingDocumentSnapshot, type DocumentParty } from "@shared/bookingDocuments";

export type BookingDocumentLabels = {
  invoiceTitle?: string; receiptTitle: string; taxInvoiceTitle: string; number: string; issuedOn: string; issuer: string; buyer: string;
  taxId: string; branch: string; phone: string; description: string; qty?: string; unitPrice?: string; amount: string; stay: string; nights: string;
  subtotal: string; net: string; vat: string; total: string; amountPaid?: string; balanceDue?: string; paymentStatus?: string;
  statusPaid?: string; statusUnpaid?: string; statusPending?: string; withholding: string; paymentMethod: string; bookingRef: string; signature: string;
};

/** Thai readers see the Buddhist year (docs/thai-glossary.md rule 4); th-TH formats with it. */
export function formatDocumentDate(iso: string, language: "th" | "en"): string {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function formatSatang(satang: number): string {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(satang / 100);
}

function party(title: string, value: DocumentParty & { phone?: string | null }, labels: BookingDocumentLabels) {
  const lines = [
    `<strong>${escapeHtml(value.name)}</strong>`,
    value.address && escapeHtml(value.address),
    value.taxId && `${escapeHtml(labels.taxId)} ${escapeHtml(value.taxId)}${value.branch ? ` (${escapeHtml(labels.branch)} ${escapeHtml(value.branch)})` : ""}`,
    !value.taxId && value.branch && `${escapeHtml(labels.branch)} ${escapeHtml(value.branch)}`,
    value.phone && `${escapeHtml(labels.phone)} ${escapeHtml(value.phone)}`,
  ].filter(Boolean);
  return `<section class="party"><h2>${escapeHtml(title)}</h2>${lines.map(line => `<div>${line}</div>`).join("")}</section>`;
}

/** Hotel and guest values are typed by people, so every value is escaped. */
export function buildBookingDocumentHtml(doc: BookingDocumentSnapshot, labels: BookingDocumentLabels, language: "th" | "en", paymentMethodLabel: string | null) {
  const title = doc.type === "invoice"
    ? (labels.invoiceTitle ?? (language === "th" ? "ใบแจ้งชำระเงิน" : "Invoice"))
    : doc.type === "tax_invoice"
      ? labels.taxInvoiceTitle
      : labels.receiptTitle;

  const stay = `${formatDocumentDate(doc.booking.checkIn, language)} – ${formatDocumentDate(doc.booking.checkOut, language)} (${doc.booking.nights} ${labels.nights})`;
  const description = [labels.stay, doc.booking.roomType].filter(Boolean).join(" ");
  // Older issued snapshots used netSatang as the VAT-exclusive subtotal and vatSatang as nullable.
  const legacy = doc as BookingDocumentSnapshot & { netSatang?: number | null };
  const subtotalSatang = doc.subtotalSatang ?? legacy.netSatang ?? doc.totalSatang;
  const vatEnabled = doc.vatEnabled ?? doc.vatSatang != null;
  const withholdingEnabled = Boolean(doc.withholdingEnabled);
  const vatLabel = doc.vatRate == null ? labels.vat : `${labels.vat} ${doc.vatRate}%`;

  const hasItems = Array.isArray(doc.items) && doc.items.length > 0;
  const colSpan = hasItems ? 3 : 1;

  const paymentStatusText = doc.paymentStatus === "verified"
    ? (labels.statusPaid ?? (language === "th" ? "ชำระแล้ว" : "Paid"))
    : (labels.statusUnpaid ?? (language === "th" ? "ยังไม่ชำระ" : "Unpaid"));

  const taxRows = `
    <tr class="sum"><td colspan="${colSpan}">${escapeHtml(labels.subtotal)}</td><td class="num">${formatSatang(subtotalSatang)}</td></tr>
    ${vatEnabled ? `<tr class="sum"><td colspan="${colSpan}">${escapeHtml(vatLabel)}</td><td class="num">${formatSatang(doc.vatSatang ?? 0)}</td></tr>` : ""}
    <tr class="total"><td colspan="${colSpan}">${escapeHtml(labels.total)}</td><td class="num">${formatSatang(doc.totalSatang)}</td></tr>
    ${withholdingEnabled ? `<tr class="sum"><td colspan="${colSpan}">${escapeHtml(labels.withholding)} ${doc.withholdingRate}%</td><td class="num">${formatSatang(doc.withholdingSatang)}</td></tr>` : ""}
    ${withholdingEnabled ? `<tr class="total"><td colspan="${colSpan}">${escapeHtml(labels.net)}</td><td class="num">${formatSatang(doc.netToPaySatang)}</td></tr>` : ""}
    ${doc.amountPaidSatang != null ? `<tr class="sum"><td colspan="${colSpan}">${escapeHtml(labels.amountPaid ?? (language === "th" ? "ยอดชำระแล้ว" : "Amount Paid"))}</td><td class="num">${formatSatang(doc.amountPaidSatang)}</td></tr>` : ""}
    ${doc.balanceSatang != null ? `<tr class="total balance-due"><td colspan="${colSpan}">${escapeHtml(labels.balanceDue ?? (language === "th" ? "ยอดค้างชำระ" : "Balance Due"))}</td><td class="num">${formatSatang(doc.balanceSatang)}</td></tr>` : ""}`;

  const tableContent = hasItems ? `
    <thead>
      <tr>
        <th>${escapeHtml(labels.description)}</th>
        <th class="num">${escapeHtml(labels.qty ?? (language === "th" ? "จำนวน" : "Qty"))}</th>
        <th class="num">${escapeHtml(labels.unitPrice ?? (language === "th" ? "ราคาต่อหน่วย" : "Unit Price"))}</th>
        <th class="num">${escapeHtml(labels.amount)}</th>
      </tr>
    </thead>
    <tbody>
      ${doc.items!.map(item => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.description ? `<br><small style="color: #666;">${escapeHtml(item.description)}</small>` : ""}
          </td>
          <td class="num">${escapeHtml(String(item.quantity))}</td>
          <td class="num">${formatSatang(item.unitPriceSatang)}</td>
          <td class="num">${formatSatang(item.totalPriceSatang)}</td>
        </tr>
      `).join("")}
      ${taxRows}
    </tbody>` : `
    <thead>
      <tr><th>${escapeHtml(labels.description)}</th><th class="num">${escapeHtml(labels.amount)}</th></tr>
    </thead>
    <tbody>
      <tr><td>${escapeHtml(description)}<br><small>${escapeHtml(stay)}</small></td><td class="num">${formatSatang(doc.totalSatang)}</td></tr>
      ${taxRows}
    </tbody>`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} ${escapeHtml(doc.number)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif; color: #111; font-size: 13px; line-height: 1.5; margin: 0; }
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 24px; box-sizing: border-box; } }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 12px; margin: 0 0 4px; color: #555; font-weight: normal; }
  .meta { text-align: right; white-space: nowrap; }
  .status-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 4px; background: #e2e8f0; color: #1e293b; }
  .status-tag.verified { background: #dcfce7; color: #166534; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 16px 0; }
  .party { overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #ccc; padding: 8px 6px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  .num { text-align: right; white-space: nowrap; }
  tr.sum td { border-bottom: none; text-align: right; }
  tr.total td { font-weight: bold; font-size: 15px; border-top: 2px solid #111; text-align: right; }
  tr.balance-due td { color: #b91c1c; }
  .foot { margin-top: 16px; }
  .sign { margin-top: 56px; display: flex; justify-content: flex-end; }
  .sign div { border-top: 1px solid #111; padding-top: 4px; min-width: 220px; text-align: center; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${doc.paymentStatus ? `<div class="status-tag ${escapeHtml(doc.paymentStatus)}">${escapeHtml(labels.paymentStatus ?? (language === "th" ? "สถานะการชำระ" : "Payment Status"))}: ${escapeHtml(paymentStatusText)}</div>` : ""}
    </div>
    <div class="meta">
      <div>${escapeHtml(labels.number)} <strong>${escapeHtml(doc.number)}</strong></div>
      <div>${escapeHtml(labels.issuedOn)} ${escapeHtml(formatDocumentDate(doc.issuedOn, language))}</div>
    </div>
  </header>
  <div class="parties">${party(labels.issuer, doc.issuer, labels)}${party(labels.buyer, doc.buyer, labels)}</div>
  <table>
    ${tableContent}
  </table>
  <div class="foot">
    ${paymentMethodLabel ? `<div>${escapeHtml(labels.paymentMethod)} ${escapeHtml(paymentMethodLabel)}</div>` : ""}
    ${doc.verifiedTransactionReference ? `<div>${escapeHtml(language === "th" ? "เลขอ้างอิงธุรกรรม" : "Verified transaction reference")}: ${escapeHtml(doc.verifiedTransactionReference)}</div>` : ""}
    <div>${escapeHtml(labels.bookingRef)} ${escapeHtml(doc.booking.id.slice(0, 8))}</div>
  </div>
  <div class="sign"><div>${escapeHtml(labels.signature)}</div></div>
  <script>window.print();</script>
</body>
</html>`;
}

/**
 * Fills a tab opened during the click (browsers block tabs opened later); its print dialog offers
 * Save as PDF. False when a popup blocker stopped the tab.
 */
export function writePrintWindow(win: Window | null, html: string): boolean {
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

/**
 * Direct file download helper that creates a client-side Blob download.
 */
export function downloadDocumentFile(filename: string, content: string, mimeType = "text/html;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Direct PDF download helper that converts base64 PDF bytes into an application/pdf Blob download.
 */
export function downloadPdfBase64(filename: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
