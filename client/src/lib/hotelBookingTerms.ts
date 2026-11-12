import type { LegalDocument } from "./legalContent";
import { hotelPrivacyPath, type HotelForPrivacy } from "./hotelGuestPrivacy";

/**
 * The booking conditions a guest accepts on the booking form (owner decision sheet 3.2). They used to link to
 * hayhost's own /terms, which is the contract with hotel owners and says nothing about a guest's stay. These
 * state only what the booking system really does; cancellation and refunds stay with the hotel, which receives
 * the money directly.
 */
function contactLines(hotel: HotelForPrivacy, labels: { name: string; address: string; phone: string; facebook: string; line: string }) {
  const lines = [`${labels.name}: ${hotel.name}`];
  if (hotel.address?.trim()) lines.push(`${labels.address}: ${hotel.address.trim()}`);
  if (hotel.public_phone?.trim()) lines.push(`${labels.phone}: ${hotel.public_phone.trim()}`);
  if (hotel.facebook_url?.trim()) lines.push(`${labels.facebook}: ${hotel.facebook_url.trim()}`);
  if (hotel.line_url?.trim()) lines.push(`${labels.line}: ${hotel.line_url.trim()}`);
  return lines;
}

function th(hotel: HotelForPrivacy, slug: string): LegalDocument {
  return {
    intro: `เงื่อนไขนี้ใช้กับการจองห้องพักของ ${hotel.name} ("โรงแรม") ผ่านหน้าจองออนไลน์ คู่สัญญาของคุณคือโรงแรม Hayhost Thailand เป็นผู้ให้บริการระบบจองให้โรงแรมเท่านั้น`,
    sections: [
      { heading: "1. การจองและการชำระเงิน", items: [
        "1.1 ราคาที่แสดงตอนจองเป็นยอดรวมของห้องพักและบริการเสริมที่คุณเลือก",
        "1.2 ชำระเต็มจำนวนด้วยพร้อมเพย์เข้าบัญชีของโรงแรมโดยตรง ภายในเวลาที่แสดงบนหน้าชำระเงิน ถ้าไม่ชำระหรือไม่ส่งสลิปทันเวลา ระบบจะยกเลิกการจองและปล่อยห้องคืน",
        "1.3 การจองยืนยันเมื่อตรวจการชำระเงินแล้ว และคุณจะได้รับอีเมลยืนยัน ระหว่างรอตรวจสลิป การจองยังไม่ถือว่ายืนยัน",
        "1.4 อย่าชำระเงินซ้ำ หากหน้าจอแจ้งว่ากำลังตรวจสอบหรือตรวจไม่ผ่าน ให้ติดต่อโรงแรมพร้อมหมายเลขการจอง",
      ] },
      { heading: "2. การยกเลิก การเปลี่ยนแปลง และการคืนเงิน", items: [
        "2.1 การยกเลิก การเปลี่ยนวันเข้าพัก และการคืนเงิน เป็นไปตามนโยบายของโรงแรม กรุณาติดต่อโรงแรมก่อนวันเข้าพักทางช่องทางในข้อ 4",
        "2.2 เงินที่คุณชำระเข้าบัญชีของโรงแรมโดยตรง โรงแรมจึงเป็นผู้คืนเงิน Hayhost ไม่ได้รับหรือถือเงินของคุณ",
      ] },
      { heading: "3. การเข้าพักและข้อมูลส่วนบุคคล", items: [
        "3.1 แขกชาวต่างชาติต้องแสดงหนังสือเดินทาง เพื่อให้โรงแรมแจ้งที่พักของคนต่างด้าว (ตม.30) ตามกฎหมาย",
        `3.2 โรงแรมใช้ข้อมูลของคุณตามนโยบายความเป็นส่วนตัวของโรงแรม อ่านได้ที่ www.hayhostth.com${hotelPrivacyPath(slug)}`,
      ] },
      { heading: "4. ติดต่อโรงแรม", items: contactLines(hotel, { name: "โรงแรม", address: "ที่อยู่", phone: "โทร", facebook: "Facebook", line: "LINE" }) },
    ],
  };
}

function en(hotel: HotelForPrivacy, slug: string): LegalDocument {
  return {
    intro: `These conditions apply to room bookings at ${hotel.name} ("the Hotel") made through its online booking page. Your agreement is with the Hotel; Hayhost Thailand only provides the Hotel's booking system.`,
    sections: [
      { heading: "1. Booking and payment", items: [
        "1.1 The price shown when you book is the total for the room and the extras you chose.",
        "1.2 Pay the full amount by PromptPay straight into the Hotel's account within the time shown on the payment page. If you do not pay or send the slip in time, the booking is cancelled and the room is released.",
        "1.3 The booking is confirmed once the payment is checked, and you receive a confirmation email. While the slip is being checked, the booking is not yet confirmed.",
        "1.4 Do not pay twice. If the page says the payment is being checked or could not be verified, contact the Hotel with your booking reference.",
      ] },
      { heading: "2. Cancellations, changes and refunds", items: [
        "2.1 Cancellations, date changes and refunds follow the Hotel's own policy. Contact the Hotel before your stay using the details in section 4.",
        "2.2 Your payment goes straight to the Hotel's account, so the Hotel makes any refund. Hayhost does not receive or hold your money.",
      ] },
      { heading: "3. Your stay and personal data", items: [
        "3.1 Foreign guests must show their passport so the Hotel can file the foreigner residence report (TM.30) required by law.",
        `3.2 The Hotel uses your data under its privacy notice at www.hayhostth.com${hotelPrivacyPath(slug)}.`,
      ] },
      { heading: "4. Contact the Hotel", items: contactLines(hotel, { name: "Hotel", address: "Address", phone: "Phone", facebook: "Facebook", line: "LINE" }) },
    ],
  };
}

export function hotelBookingTerms(language: "th" | "en", hotel: HotelForPrivacy, slug: string): LegalDocument {
  return language === "th" ? th(hotel, slug) : en(hotel, slug);
}

/** Where a hotel's booking conditions for guests live. */
export function hotelBookingTermsPath(slug: string) {
  return `/${encodeURIComponent(slug)}/booking-terms`;
}
