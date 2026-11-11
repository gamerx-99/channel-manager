import type { LegalDocument } from "./legalContent";

/**
 * A hotel's privacy notice for its guests (owner, 2026-11-11). The hotel is the data controller for its guests and
 * Hayhost processes their data for the hotel (terms 6.2, DPA, /privacy 1.3), so the notice names the hotel and its
 * contact details. Written for hayhost from what the booking system actually collects, and kept in line with the
 * DPA and hayhost's own /privacy (overseas providers, deletion after the hotel leaves, technical data at booking).
 */
export type HotelForPrivacy = {
  name: string;
  address?: string | null;
  public_phone?: string | null;
  facebook_url?: string | null;
  line_url?: string | null;
};

const HAYHOST_SUPPORT = "support@hayhostth.com";
const HAYHOST_PRIVACY = "www.hayhostth.com/privacy";

function contactLines(hotel: HotelForPrivacy, labels: { name: string; address: string; phone: string; facebook: string; line: string }) {
  const lines = [`${labels.name}: ${hotel.name}`];
  if (hotel.address?.trim()) lines.push(`${labels.address}: ${hotel.address.trim()}`);
  if (hotel.public_phone?.trim()) lines.push(`${labels.phone}: ${hotel.public_phone.trim()}`);
  if (hotel.facebook_url?.trim()) lines.push(`${labels.facebook}: ${hotel.facebook_url.trim()}`);
  if (hotel.line_url?.trim()) lines.push(`${labels.line}: ${hotel.line_url.trim()}`);
  return lines;
}

function th(hotel: HotelForPrivacy): LegalDocument {
  return {
    intro: `${hotel.name} ("โรงแรม") เป็นผู้ควบคุมข้อมูลส่วนบุคคลของแขกที่จองและเข้าพัก นโยบายนี้บอกว่าโรงแรมเก็บข้อมูลอะไรของคุณ ใช้ทำอะไร ส่งให้ใคร เก็บนานเท่าไร และคุณใช้สิทธิของคุณได้อย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562`,
    sections: [
      { heading: "1. ข้อมูลที่โรงแรมเก็บ", items: [
        "1.1 ข้อมูลการจอง: ชื่อ อีเมล เบอร์โทร วันเข้าพัก จำนวนผู้เข้าพัก คำขอพิเศษ และบริการเสริมที่เลือก",
        "1.2 ข้อมูลการชำระเงิน: ยอดเงิน รูปสลิปโอนเงิน และผลการตรวจสลิป โรงแรมไม่เก็บเลขบัตรเครดิตหรือรหัสผ่านธนาคาร",
        "1.3 แขกชาวต่างชาติ: ชื่อ-นามสกุล เพศ สัญชาติ วันเกิด และเลขหนังสือเดินทาง เพื่อแจ้งที่พักของคนต่างด้าว (ตม.30)",
        "1.4 โรงแรมไม่ขอข้อมูลที่อ่อนไหว เช่น ศาสนาหรือสุขภาพ หากคุณแจ้งเอง เช่น การแพ้อาหารในคำขอพิเศษ โรงแรมจะใช้เพื่อดูแลคุณระหว่างเข้าพักเท่านั้น",
        `1.5 ข้อมูลทางเทคนิคตอนจองออนไลน์ เช่น หมายเลข IP Hayhost เก็บเองเพื่อความปลอดภัยของระบบ ตามนโยบายที่ ${HAYHOST_PRIVACY}`,
      ] },
      { heading: "2. ใช้ข้อมูลทำอะไร", table: { head: ["วัตถุประสงค์", "ฐานทางกฎหมาย"], rows: [
        ["รับ ยืนยัน และจัดการการจอง เตรียมห้องและบริการ ส่งอีเมลเรื่องการจอง", "การปฏิบัติตามสัญญา (มาตรา 24(3))"],
        ["ตรวจการชำระเงินและออกใบเสร็จหรือใบกำกับภาษี", "การปฏิบัติตามสัญญา และหน้าที่ตามกฎหมาย (มาตรา 24(3) และ 24(6))"],
        ["แจ้งที่พักของคนต่างด้าวต่อสำนักงานตรวจคนเข้าเมือง ตามพระราชบัญญัติคนเข้าเมือง พ.ศ. 2522 มาตรา 38", "หน้าที่ตามกฎหมาย (มาตรา 24(6))"],
        ["ป้องกันการจองปลอมและการใช้งานผิดปกติ", "ประโยชน์โดยชอบด้วยกฎหมาย (มาตรา 24(5))"],
        ["ส่งข่าวสารหรือโปรโมชันของโรงแรม", "ความยินยอม ส่งเฉพาะเมื่อคุณยินยอมแยกต่างหาก และถอนได้ทุกเมื่อ"],
      ] } },
      { heading: "3. ถ้าไม่ให้ข้อมูล", items: [
        "ชื่อและอีเมลจำเป็นต่อการจอง ถ้าไม่ให้ โรงแรมจะรับการจองไม่ได้ แขกชาวต่างชาติต้องให้ข้อมูลหนังสือเดินทางเพราะกฎหมายกำหนดให้โรงแรมแจ้ง ตม.30",
      ] },
      { heading: "4. ใครได้รับข้อมูล", items: [
        "4.1 พนักงานของโรงแรมที่ต้องใช้ข้อมูลเพื่อดูแลการเข้าพักของคุณ",
        `4.2 Hayhost Thailand ผู้ให้บริการระบบจองของโรงแรม ในฐานะผู้ประมวลผลข้อมูลตามคำสั่งของโรงแรม และผู้ให้บริการที่ Hayhost ใช้ เช่น คลาวด์ อีเมล และการตรวจสลิป ดูกลุ่มผู้ให้บริการได้ที่ ${HAYHOST_PRIVACY} Hayhost ไม่นำข้อมูลของคุณไปใช้เพื่อประโยชน์ของตนเอง`,
        "4.3 สำนักงานตรวจคนเข้าเมือง สำหรับ ตม.30 และหน่วยงานรัฐอื่นเมื่อกฎหมายกำหนด",
        "4.4 โรงแรมไม่ขายข้อมูลของคุณ",
      ] },
      { heading: "5. การส่งข้อมูลไปต่างประเทศ", items: [
        "ผู้ให้บริการคลาวด์และอีเมลของระบบอาจเก็บหรือส่งข้อมูลผ่านเซิร์ฟเวอร์นอกประเทศไทย รวมถึงสหรัฐอเมริกา โดยมีมาตรการคุ้มครองตามมาตรา 28 และมาตรา 29 แห่งพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล",
      ] },
      { heading: "6. เก็บข้อมูลนานเท่าไร", items: [
        "6.1 ข้อมูลการจองและข้อมูล ตม.30: เท่าที่จำเป็นต่อการให้บริการ การดูแลข้อร้องเรียน และการปฏิบัติตามกฎหมาย",
        "6.2 สลิปและเอกสารการเงิน: 5 ปี ตามประมวลรัษฎากร",
        "6.3 หากโรงแรมเลิกใช้ระบบ Hayhost ข้อมูลในระบบจะถูกลบภายใน 60 วัน เว้นแต่กฎหมายกำหนดให้เก็บ",
      ] },
      { heading: "7. ความปลอดภัย", items: [
        "ข้อมูลถูกเข้ารหัสระหว่างรับส่ง แยกเก็บเป็นรายโรงแรม และพนักงานเห็นข้อมูลได้ตามสิทธิ์ที่โรงแรมกำหนด หากเกิดเหตุละเมิดที่มีความเสี่ยงสูงต่อคุณ โรงแรมจะแจ้งคุณพร้อมแนวทางแก้ไข",
      ] },
      { heading: "8. สิทธิของคุณ", items: [
        "(1) ขอเข้าถึงและขอสำเนาข้อมูลของคุณ",
        "(2) ขอให้แก้ไขข้อมูลที่ไม่ถูกต้องหรือไม่เป็นปัจจุบัน",
        "(3) ขอให้ลบ ทำลาย หรือทำให้ข้อมูลไม่สามารถระบุตัวคุณได้",
        "(4) ขอให้ระงับการใช้ข้อมูล",
        "(5) คัดค้านการใช้ข้อมูล",
        "(6) ขอรับหรือขอให้ส่งข้อมูลของคุณไปยังผู้ควบคุมข้อมูลรายอื่น",
        "(7) ถอนความยินยอมที่เคยให้ไว้ การถอนไม่กระทบสิ่งที่ทำไปก่อนหน้า",
        "ส่งคำขอได้ทางช่องทางในข้อ 10 โรงแรมจะตอบภายใน 30 วัน โรงแรมอาจปฏิเสธบางคำขอได้เมื่อกฎหมายกำหนดให้เก็บข้อมูลไว้ เช่น ข้อมูล ตม.30 และเอกสารบัญชี และคุณมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล",
      ] },
      { heading: "9. การเปลี่ยนแปลงนโยบาย", items: [
        "โรงแรมอาจปรับปรุงนโยบายนี้ และจะแสดงฉบับล่าสุดพร้อมวันที่ปรับปรุงไว้ที่หน้านี้",
      ] },
      { heading: "10. ติดต่อโรงแรม", items: [
        ...contactLines(hotel, { name: "ผู้ควบคุมข้อมูลส่วนบุคคล", address: "ที่อยู่", phone: "โทร", facebook: "Facebook", line: "LINE" }),
        `หากติดต่อโรงแรมไม่ได้ ส่งคำขอถึง Hayhost Thailand ได้ที่ ${HAYHOST_SUPPORT} เราจะส่งต่อให้โรงแรมและช่วยโรงแรมดำเนินการ`,
      ] },
    ],
  };
}

function en(hotel: HotelForPrivacy): LegalDocument {
  return {
    intro: `${hotel.name} ("the Hotel") is the data controller for the personal data of guests who book and stay. This notice explains what the Hotel collects about you, what it is used for, who receives it, how long it is kept, and how to use your rights under Thailand's Personal Data Protection Act B.E. 2562 (2019).`,
    sections: [
      { heading: "1. What the Hotel collects", items: [
        "1.1 Booking details: name, email, phone number, stay dates, number of guests, special requests and the extras you choose.",
        "1.2 Payment details: the amount, the image of your transfer slip and the result of the slip check. The Hotel does not keep card numbers or banking passwords.",
        "1.3 Foreign guests: full name, sex, nationality, date of birth and passport number, for the foreigner residence report (TM.30).",
        "1.4 The Hotel does not ask for sensitive data such as religion or health. If you tell it yourself, for example a food allergy in your special requests, the Hotel uses it only to look after you during your stay.",
        `1.5 Technical data taken when you book online, such as your IP address, is kept by Hayhost itself for system security, under its policy at ${HAYHOST_PRIVACY}.`,
      ] },
      { heading: "2. What it is used for", table: { head: ["Purpose", "Legal basis"], rows: [
        ["Take, confirm and manage your booking, prepare your room and extras, and email you about the booking", "Performance of a contract (section 24(3))"],
        ["Check your payment and issue a receipt or tax invoice", "Contract and legal obligation (sections 24(3) and 24(6))"],
        ["Report foreign guests' residence to the Immigration Bureau under section 38 of the Immigration Act B.E. 2522 (1979)", "Legal obligation (section 24(6))"],
        ["Prevent fake bookings and misuse", "Legitimate interest (section 24(5))"],
        ["Send the Hotel's news or offers", "Consent: only if you agree separately, and you can withdraw at any time"],
      ] } },
      { heading: "3. If you do not give your data", items: [
        "A name and an email are needed to book; without them the Hotel cannot take your booking. Foreign guests must give their passport details because the law requires the Hotel to file the TM.30 report.",
      ] },
      { heading: "4. Who receives it", items: [
        "4.1 Hotel staff who need it to look after your stay.",
        `4.2 Hayhost Thailand, the Hotel's booking system, as data processor on the Hotel's instructions, and the providers Hayhost uses, such as cloud hosting, email and slip checking. The groups of providers are listed at ${HAYHOST_PRIVACY}. Hayhost does not use your data for its own purposes.`,
        "4.3 The Immigration Bureau for TM.30, and other authorities when the law requires.",
        "4.4 The Hotel does not sell your data.",
      ] },
      { heading: "5. Transfers outside Thailand", items: [
        "The system's cloud and email providers may store or pass data through servers outside Thailand, including in the United States, with safeguards under sections 28 and 29 of the Personal Data Protection Act.",
      ] },
      { heading: "6. How long it is kept", items: [
        "6.1 Booking and TM.30 data: as long as needed for the service, handling complaints, and complying with the law.",
        "6.2 Slips and financial records: 5 years, under the Revenue Code.",
        "6.3 If the Hotel stops using Hayhost, its data in the system is deleted within 60 days unless the law requires keeping it.",
      ] },
      { heading: "7. Security", items: [
        "Data is encrypted in transit, kept separately for each hotel, and staff see only what the Hotel allows their role to see. If a breach puts you at high risk, the Hotel will tell you and what is being done about it.",
      ] },
      { heading: "8. Your rights", items: [
        "(1) Access your data and get a copy",
        "(2) Have inaccurate or out-of-date data corrected",
        "(3) Have your data erased, destroyed or made anonymous",
        "(4) Have the use of your data restricted",
        "(5) Object to the use of your data",
        "(6) Receive your data, or have it sent to another data controller",
        "(7) Withdraw consent you gave; this does not affect what was done before",
        "Send your request through the contacts in section 10. The Hotel will reply within 30 days. It may refuse some requests where the law requires keeping the data, such as TM.30 data and accounting records. You may also complain to the Personal Data Protection Committee.",
      ] },
      { heading: "9. Changes to this notice", items: [
        "The Hotel may update this notice and will show the latest version, with its date, on this page.",
      ] },
      { heading: "10. Contact the Hotel", items: [
        ...contactLines(hotel, { name: "Data controller", address: "Address", phone: "Phone", facebook: "Facebook", line: "LINE" }),
        `If you cannot reach the Hotel, send your request to Hayhost Thailand at ${HAYHOST_SUPPORT}. We will pass it to the Hotel and help the Hotel deal with it.`,
      ] },
    ],
  };
}

export function hotelGuestPrivacy(language: "th" | "en", hotel: HotelForPrivacy): LegalDocument {
  return language === "th" ? th(hotel) : en(hotel);
}

/** Where the guest-facing notice of a hotel lives. */
export function hotelPrivacyPath(slug: string) {
  return `/${encodeURIComponent(slug)}/privacy`;
}
