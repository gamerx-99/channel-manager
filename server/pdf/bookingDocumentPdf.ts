import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { THAI_FONT_BOLD_BASE64, THAI_FONT_REGULAR_BASE64 } from "../../shared/fonts/thaiFonts";
import type { BookingDocumentSnapshot } from "../../shared/bookingDocuments";

function formatSatangAmount(satang: number): string {
  return (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A4 Dimensions in points: 210mm x 297mm
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function generateBookingDocumentPdf(snapshot: BookingDocumentSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const regularFont = await doc.embedFont(base64ToUint8Array(THAI_FONT_REGULAR_BASE64));
  const boldFont = await doc.embedFont(base64ToUint8Array(THAI_FONT_BOLD_BASE64));

  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const marginX = 40;
  const contentWidth = A4_WIDTH - marginX * 2; // 515.28

  // Colors
  const brickColor = rgb(0.584, 0.282, 0.192); // #954831
  const darkInk = rgb(0.12, 0.12, 0.12);
  const mutedInk = rgb(0.45, 0.45, 0.45);
  const borderGray = rgb(0.88, 0.88, 0.88);
  const tableHeaderBg = rgb(0.96, 0.96, 0.97);

  let currentY = A4_HEIGHT - 45;

  // 1. Top Decorative Brand Bar
  page.drawRectangle({
    x: marginX,
    y: currentY,
    width: contentWidth,
    height: 4,
    color: brickColor,
  });

  currentY -= 25;

  // 2. Header: Title & Document Number (Left) vs Issuer / Hotel (Right)
  const titleText =
    snapshot.type === "invoice"
      ? "ใบแจ้งชำระเงิน / INVOICE"
      : snapshot.type === "tax_invoice"
        ? "ใบกำกับภาษี / TAX INVOICE"
        : "ใบเสร็จรับเงิน / RECEIPT";

  page.drawText(titleText, {
    x: marginX,
    y: currentY,
    size: 16,
    font: boldFont,
    color: brickColor,
  });

  // Hotel / Issuer Name (Right aligned)
  const issuerName = snapshot.issuer.name;
  const issuerNameWidth = boldFont.widthOfTextAtSize(issuerName, 13);
  page.drawText(issuerName, {
    x: A4_WIDTH - marginX - issuerNameWidth,
    y: currentY,
    size: 13,
    font: boldFont,
    color: darkInk,
  });

  currentY -= 18;

  // Document Number & Issuer Address
  page.drawText(`เลขที่ / No: ${snapshot.number}`, {
    x: marginX,
    y: currentY,
    size: 10,
    font: boldFont,
    color: darkInk,
  });

  const issuerAddr = snapshot.issuer.address || "";
  if (issuerAddr) {
    const issuerAddrWidth = regularFont.widthOfTextAtSize(issuerAddr, 9);
    page.drawText(issuerAddr, {
      x: A4_WIDTH - marginX - issuerAddrWidth,
      y: currentY,
      size: 9,
      font: regularFont,
      color: mutedInk,
    });
  }

  currentY -= 15;

  // Issue Date & Issuer Tax ID / Branch
  page.drawText(`วันที่ออก / Date: ${snapshot.issuedOn}`, {
    x: marginX,
    y: currentY,
    size: 9,
    font: regularFont,
    color: mutedInk,
  });

  const issuerTaxParts: string[] = [];
  if (snapshot.issuer.taxId) issuerTaxParts.push(`เลขประจำตัวผู้เสียภาษี: ${snapshot.issuer.taxId}`);
  if (snapshot.issuer.branch) issuerTaxParts.push(`สาขา: ${snapshot.issuer.branch}`);
  if (snapshot.issuer.phone) issuerTaxParts.push(`โทร: ${snapshot.issuer.phone}`);
  const issuerTaxText = issuerTaxParts.join(" | ");
  if (issuerTaxText) {
    const taxWidth = regularFont.widthOfTextAtSize(issuerTaxText, 9);
    page.drawText(issuerTaxText, {
      x: A4_WIDTH - marginX - taxWidth,
      y: currentY,
      size: 9,
      font: regularFont,
      color: mutedInk,
    });
  }

  currentY -= 20;

  // Horizontal divider
  page.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: A4_WIDTH - marginX, y: currentY },
    thickness: 1,
    color: borderGray,
  });

  currentY -= 20;

  // 3. Buyer & Booking Stay Details Box (Two Column Layout)
  const boxTop = currentY;
  const colWidth = (contentWidth - 20) / 2;

  // Left Column: Bill To / Buyer
  page.drawText("ข้อมูลผู้เข้าพัก / BILL TO", {
    x: marginX,
    y: currentY,
    size: 9,
    font: boldFont,
    color: brickColor,
  });
  currentY -= 14;
  page.drawText(snapshot.buyer.name, {
    x: marginX,
    y: currentY,
    size: 10,
    font: boldFont,
    color: darkInk,
  });
  if (snapshot.buyer.address) {
    currentY -= 13;
    page.drawText(snapshot.buyer.address, {
      x: marginX,
      y: currentY,
      size: 9,
      font: regularFont,
      color: mutedInk,
    });
  }
  if (snapshot.buyer.taxId) {
    currentY -= 13;
    const buyerTax = `เลขผู้เสียภาษี: ${snapshot.buyer.taxId}${snapshot.buyer.branch ? ` (${snapshot.buyer.branch})` : ""}`;
    page.drawText(buyerTax, {
      x: marginX,
      y: currentY,
      size: 9,
      font: regularFont,
      color: mutedInk,
    });
  }

  // Right Column: Booking & Stay
  const col2X = marginX + colWidth + 20;
  let col2Y = boxTop;
  page.drawText("ข้อมูลการจอง / STAY DETAILS", {
    x: col2X,
    y: col2Y,
    size: 9,
    font: boldFont,
    color: brickColor,
  });
  col2Y -= 14;
  page.drawText(`รหัสการจอง: ${snapshot.booking.id}`, {
    x: col2X,
    y: col2Y,
    size: 9,
    font: regularFont,
    color: darkInk,
  });
  col2Y -= 13;
  const stayText = `เช็กอิน: ${snapshot.booking.checkIn} — เช็กเอาต์: ${snapshot.booking.checkOut} (${snapshot.booking.nights} คืน)`;
  page.drawText(stayText, {
    x: col2X,
    y: col2Y,
    size: 9,
    font: regularFont,
    color: mutedInk,
  });
  if (snapshot.booking.roomType) {
    col2Y -= 13;
    page.drawText(`ประเภทห้อง: ${snapshot.booking.roomType}`, {
      x: col2X,
      y: col2Y,
      size: 9,
      font: regularFont,
      color: mutedInk,
    });
  }

  currentY = Math.min(currentY, col2Y) - 22;

  // 4. Itemized Table
  // Column definitions
  const colDescX = marginX + 8;
  const colQtyX = marginX + 200;
  const colPriceRightX = marginX + 350;
  const colTotalRightX = A4_WIDTH - marginX - 8;

  // Table Header Background
  page.drawRectangle({
    x: marginX,
    y: currentY - 6,
    width: contentWidth,
    height: 22,
    color: tableHeaderBg,
  });
  page.drawRectangle({
    x: marginX,
    y: currentY - 6,
    width: contentWidth,
    height: 22,
    borderColor: borderGray,
    borderWidth: 1,
  });

  page.drawText("รายการ / Description", {
    x: colDescX,
    y: currentY,
    size: 9,
    font: boldFont,
    color: darkInk,
  });
  page.drawText("จำนวน / Qty", {
    x: colQtyX,
    y: currentY,
    size: 9,
    font: boldFont,
    color: darkInk,
  });

  const priceHeader = "ราคา / Unit (THB)";
  const priceHeaderWidth = boldFont.widthOfTextAtSize(priceHeader, 9);
  page.drawText(priceHeader, {
    x: colPriceRightX - priceHeaderWidth,
    y: currentY,
    size: 9,
    font: boldFont,
    color: darkInk,
  });

  const totalHeader = "ยอดรวม / Total (THB)";
  const totalHeaderWidth = boldFont.widthOfTextAtSize(totalHeader, 9);
  page.drawText(totalHeader, {
    x: colTotalRightX - totalHeaderWidth,
    y: currentY,
    size: 9,
    font: boldFont,
    color: darkInk,
  });

  currentY -= 20;

  // Items
  const items = snapshot.items?.length
    ? snapshot.items
    : [
        {
          name: snapshot.booking.roomType ? `Room: ${snapshot.booking.roomType}` : "Room stay",
          description: `${snapshot.booking.checkIn} – ${snapshot.booking.checkOut} (${snapshot.booking.nights} nights)`,
          quantity: snapshot.booking.nights,
          unitPriceSatang: Math.round(snapshot.totalSatang / Math.max(1, snapshot.booking.nights)),
          totalPriceSatang: snapshot.totalSatang,
        },
      ];

  for (const item of items) {
    page.drawText(item.name, {
      x: colDescX,
      y: currentY,
      size: 9,
      font: boldFont,
      color: darkInk,
    });

    const qtyStr = String(item.quantity);
    page.drawText(qtyStr, {
      x: colQtyX + 15,
      y: currentY,
      size: 9,
      font: regularFont,
      color: darkInk,
    });

    const unitStr = formatSatangAmount(item.unitPriceSatang);
    const unitWidth = regularFont.widthOfTextAtSize(unitStr, 9);
    page.drawText(unitStr, {
      x: colPriceRightX - unitWidth,
      y: currentY,
      size: 9,
      font: regularFont,
      color: darkInk,
    });

    const totalStr = formatSatangAmount(item.totalPriceSatang);
    const totalWidth = boldFont.widthOfTextAtSize(totalStr, 9);
    page.drawText(totalStr, {
      x: colTotalRightX - totalWidth,
      y: currentY,
      size: 9,
      font: boldFont,
      color: darkInk,
    });

    if (item.description) {
      currentY -= 12;
      page.drawText(item.description, {
        x: colDescX,
        y: currentY,
        size: 8,
        font: regularFont,
        color: mutedInk,
      });
    }

    currentY -= 12;
    page.drawLine({
      start: { x: marginX, y: currentY },
      end: { x: A4_WIDTH - marginX, y: currentY },
      thickness: 0.5,
      color: borderGray,
    });
    currentY -= 14;
  }

  currentY -= 10;

  // 5. Summary Section & Totals
  const summaryBoxWidth = 230;
  const summaryBoxX = A4_WIDTH - marginX - summaryBoxWidth;
  const summaryLabelX = summaryBoxX + 10;
  const summaryValX = A4_WIDTH - marginX - 10;

  // Payment Status Box (Left of Summary)
  const isPaid = snapshot.paymentStatus === "verified" || snapshot.type === "receipt" || snapshot.type === "tax_invoice";
  const statusBoxWidth = 200;
  const statusBoxX = marginX;
  const statusBoxTop = currentY;

  // Draw Status Card
  page.drawRectangle({
    x: statusBoxX,
    y: statusBoxTop - 65,
    width: statusBoxWidth,
    height: 70,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: borderGray,
    borderWidth: 1,
  });

  page.drawText("สถานะการชำระเงิน / Payment Status", {
    x: statusBoxX + 12,
    y: statusBoxTop - 16,
    size: 8,
    font: boldFont,
    color: mutedInk,
  });

  const statusText = isPaid ? "VERIFIED / ชำระแล้ว" : "UNPAID / ยังไม่ชำระ";
  const statusColor = isPaid ? rgb(0.12, 0.55, 0.28) : rgb(0.85, 0.45, 0.1);
  page.drawText(statusText, {
    x: statusBoxX + 12,
    y: statusBoxTop - 34,
    size: 11,
    font: boldFont,
    color: statusColor,
  });

  if (snapshot.booking.paymentMethod) {
    page.drawText(`ช่องทาง: ${snapshot.booking.paymentMethod}`, {
      x: statusBoxX + 12,
      y: statusBoxTop - 52,
      size: 8,
      font: regularFont,
      color: mutedInk,
    });
  }

  // Summary Lines (Right Side)
  const drawSummaryLine = (label: string, valueStr: string, isBold = false, isAccent = false) => {
    const font = isBold ? boldFont : regularFont;
    const color = isAccent ? brickColor : darkInk;
    page.drawText(label, {
      x: summaryLabelX,
      y: currentY,
      size: 9,
      font,
      color,
    });
    const valWidth = font.widthOfTextAtSize(valueStr, 9);
    page.drawText(valueStr, {
      x: summaryValX - valWidth,
      y: currentY,
      size: 9,
      font,
      color,
    });
    currentY -= 14;
  };

  drawSummaryLine("ยอดรวมก่อนภาษี / Subtotal", `${formatSatangAmount(snapshot.subtotalSatang)} THB`);

  if (snapshot.vatEnabled) {
    drawSummaryLine(`ภาษีมูลค่าเพิ่ม / VAT (${snapshot.vatRate}%)`, `${formatSatangAmount(snapshot.vatSatang)} THB`);
  }

  if (snapshot.withholdingEnabled) {
    drawSummaryLine(`หัก ณ ที่จ่าย / WHT (${snapshot.withholdingRate}%)`, `-${formatSatangAmount(snapshot.withholdingSatang)} THB`);
  }

  // Divider above Grand Total
  page.drawLine({
    start: { x: summaryBoxX, y: currentY + 4 },
    end: { x: A4_WIDTH - marginX, y: currentY + 4 },
    thickness: 1,
    color: borderGray,
  });

  drawSummaryLine("ยอดรวมสุทธิ / Total", `${formatSatangAmount(snapshot.totalSatang)} THB`, true, true);

  const amountPaid = snapshot.amountPaidSatang ?? (isPaid ? snapshot.totalSatang : 0);
  const balance = snapshot.balanceSatang ?? Math.max(0, snapshot.totalSatang - amountPaid);

  drawSummaryLine("ชำระแล้ว / Amount Paid", `${formatSatangAmount(amountPaid)} THB`, true);
  drawSummaryLine("ยอดคงค้าง / Balance Due", `${formatSatangAmount(balance)} THB`, true, balance > 0);

  // 6. Footer
  const footerY = 35;
  page.drawLine({
    start: { x: marginX, y: footerY + 15 },
    end: { x: A4_WIDTH - marginX, y: footerY + 15 },
    thickness: 0.5,
    color: borderGray,
  });

  page.drawText("เอกสารนี้สร้างขึ้นโดยระบบจัดการโรงแรม Hayhost / Generated by Hayhost Channel Manager", {
    x: marginX,
    y: footerY,
    size: 8,
    font: regularFont,
    color: mutedInk,
  });

  const pageStr = "Page 1 / 1";
  const pageStrWidth = regularFont.widthOfTextAtSize(pageStr, 8);
  page.drawText(pageStr, {
    x: A4_WIDTH - marginX - pageStrWidth,
    y: footerY,
    size: 8,
    font: regularFont,
    color: mutedInk,
  });

  return doc.save();
}
