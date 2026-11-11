import type { LegalDocument } from "./legalContent";

/**
 * A hotel's privacy notice for its guests (owner, 2026-11-11). The hotel is the data controller for its guests and
 * Hayhost processes their data for the hotel (terms 6.2, DPA, /privacy 1.3), so the notice names the hotel and its
 * contact details. Text supplied by the owner, with "บริษัท" written as the hotel.
 */
export type HotelForPrivacy = {
  name: string;
  address?: string | null;
  public_phone?: string | null;
  facebook_url?: string | null;
  line_url?: string | null;
};

const HAYHOST_SUPPORT = "support@hayhostth.com";

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
    intro: `นโยบายนี้เป็นของ ${hotel.name} ("โรงแรม") ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคลของแขกที่จองและเข้าพัก โรงแรมใช้ระบบ Hayhost Thailand รับจองและเก็บข้อมูลการจองในฐานะผู้ประมวลผลข้อมูลส่วนบุคคลตามคำสั่งของโรงแรม`,
    sections: [
      { heading: "1. คำนิยาม", items: [
        "“ข้อมูลส่วนบุคคล” หมายถึง ข้อมูลเกี่ยวกับบุคคลซึ่งทำให้สามารถระบุตัวบุคคลนั้นได้ไม่ว่าทางตรงหรือทางอ้อม แต่ไม่รวมถึงข้อมูลของผู้ถึงแก่กรรมโดยเฉพาะ",
        "“ข้อมูลที่อ่อนไหว” หมายถึง ข้อมูลที่เป็นเรื่องส่วนตัวโดยแท้ของบุคคล แต่มีความอ่อนไหวและอาจสุ่มเสี่ยงต่อการเลือกปฏิบัติอย่างไม่เป็นธรรม เช่น เชื้อชาติ ความคิดเห็นทางการเมือง ความเชื่อในลัทธิ ศาสนาหรือปรัชญา ข้อมูลสุขภาพ ความพิการ หรือข้อมูลอื่นใดซึ่งกระทบต่อเจ้าของข้อมูลส่วนบุคคล",
        "“ผู้ควบคุมข้อมูลส่วนบุคคล” หมายถึง บุคคลหรือนิติบุคคลซึ่งมีอำนาจหน้าที่ตัดสินใจเกี่ยวกับการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคล",
        "“ผู้ประมวลผลข้อมูลส่วนบุคคล” หมายถึง บุคคลหรือนิติบุคคลซึ่งดำเนินการเกี่ยวกับการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลตามคำสั่งหรือในนามของผู้ควบคุมข้อมูลส่วนบุคคล ทั้งนี้บุคคลหรือนิติบุคคลซึ่งดำเนินการดังกล่าวไม่เป็นผู้ควบคุมข้อมูลส่วนบุคคล",
      ] },
      { heading: "2. การเก็บรวบรวมข้อมูลส่วนบุคคล", items: [
        "โรงแรมจะจัดเก็บรวบรวมข้อมูลส่วนบุคคลโดยมีวัตถุประสงค์ ขอบเขต และใช้วิธีการที่ชอบด้วยกฎหมาย โดยในการเก็บรวบรวมนั้นจะทำเพียงเท่าที่จำเป็นแก่การดำเนินงานภายใต้วัตถุประสงค์ของโรงแรมเท่านั้น ทั้งนี้โรงแรมจะดำเนินการให้เจ้าของข้อมูลรับรู้ ให้ความยินยอมทางอิเล็กทรอนิกส์ หรือตามแบบวิธีการของโรงแรม กรณีที่โรงแรมจัดเก็บข้อมูลที่อ่อนไหวของเจ้าของข้อมูล โรงแรมจะขอความยินยอมจากเจ้าของข้อมูลโดยชัดแจ้งก่อนทำการเก็บรวบรวม เว้นแต่การเก็บข้อมูลส่วนบุคคลและข้อมูลที่อ่อนไหวจะเข้าข้อยกเว้นตามที่พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 หรือกฎหมายอื่นกำหนดไว้",
      ] },
      { heading: "3. วัตถุประสงค์ในการเก็บรวบรวม หรือใช้ข้อมูลส่วนบุคคล", items: [
        "โรงแรมจะทำการเก็บรวบรวม หรือใช้ข้อมูลส่วนบุคคลของเจ้าของข้อมูล เพื่อวัตถุประสงค์ตามที่ระบุไว้ในนโยบายนี้ และจะไม่ใช้ข้อมูลเพื่อวัตถุประสงค์อื่นใด เว้นแต่ได้รับความยินยอมจากลูกค้าหรือตามที่กฎหมายกำหนด ดังนี้",
        "(1) เพื่อประโยชน์ในการดำเนินงานและการให้บริการของโรงแรม",
        "(2) เพื่อปรับปรุงคุณภาพการบริการให้มีประสิทธิภาพมากยิ่งขึ้น",
        "(3) เพื่อให้โรงแรมสามารถปฏิบัติตามภาระผูกพันตามสัญญา",
        "(4) เพื่อปรับปรุงข้อมูลส่วนบุคคลให้มีความเป็นปัจจุบัน",
        "(5) เพื่อป้องกันอันตรายร้ายแรงอันอาจเกิดต่อสุขภาพและชีวิต",
        "(6) เพื่อประโยชน์อันชอบธรรมของโรงแรมและบุคคลอื่น โดยไม่เกินขอบเขตที่เจ้าของข้อมูลสามารถคาดหมายได้อย่างสมเหตุสมผล และไม่กระทบต่อสิทธิเสรีภาพของเจ้าของข้อมูล",
        "(7) เพื่อการปฏิบัติตามกฎหมายหรือกฎระเบียบที่เกี่ยวข้องกับการดำเนินงานของโรงแรม",
      ] },
      { heading: "4. การเปิดเผยข้อมูลส่วนบุคคล", items: [
        "โรงแรมจะไม่เปิดเผยข้อมูลส่วนบุคคลของเจ้าของข้อมูลไปให้บุคคลใดโดยปราศจากความยินยอม และจะเปิดเผยตามวัตถุประสงค์ที่ได้มีการแจ้งไว้ อย่างไรก็ดี เพื่อให้เป็นประโยชน์ต่อการดำเนินงานของโรงแรมและการให้บริการแก่เจ้าของข้อมูล โรงแรมอาจมีความจำเป็นในการเปิดเผยข้อมูลส่วนบุคคลของเจ้าของข้อมูลให้แก่ บริษัทในเครือ ผู้ตรวจสอบภายใน ผู้สอบบัญชี บุคคลหรือนิติบุคคลอื่นตามที่กฎหมายกำหนด",
      ] },
      { heading: "5. การคุ้มครองข้อมูลส่วนบุคคล", items: [
        "โรงแรมจะกำหนดมาตรการต่างๆ ที่เกี่ยวข้องกับการรักษาความมั่นคงปลอดภัยของข้อมูลส่วนบุคคลที่สอดคล้องกับกฎหมาย ระเบียบ หลักเกณฑ์ และแนวปฏิบัติด้านการคุ้มครองข้อมูลส่วนบุคคลให้แก่พนักงานของโรงแรมและบุคคลอื่นที่เกี่ยวข้อง รวมถึงการส่งเสริมและสนับสนุนให้พนักงานมีความรู้และตระหนักถึงหน้าที่และความรับผิดชอบในการเก็บรวบรวม การจัดเก็บรักษา การใช้ การดูแลข้อมูลส่วนบุคคลให้มีความถูกต้องเป็นปัจจุบัน และการเปิดเผยข้อมูลส่วนบุคคล โรงแรมจะใช้มาตรการรักษาความปลอดภัยที่เหมาะสมเพื่อป้องกันการเข้าถึงหรือการรั่วไหลของข้อมูล การปรับเปลี่ยนหรือการทำลายข้อมูลส่วนบุคคลโดยไม่ได้รับอนุญาต โดยพนักงานของโรงแรมต้องปฏิบัติตามนโยบายและแนวปฏิบัติการคุ้มครองข้อมูลส่วนบุคคลตามที่โรงแรมกำหนดไว้ เพื่อให้โรงแรมสามารถปฏิบัติตามนโยบายและกฎหมายคุ้มครองข้อมูลส่วนบุคคลได้อย่างถูกต้องและมีประสิทธิภาพ",
      ] },
      { heading: "6. การควบคุมผู้ให้บริการภายนอก", items: [
        "โรงแรมอาจมอบการจัดการข้อมูลส่วนบุคคลแก่ผู้ให้บริการภายนอกของโรงแรม ซึ่งรวมถึงผู้ประมวลผลข้อมูลส่วนบุคคล โดยโรงแรมจะเลือกผู้ให้บริการที่ได้รับการยืนยันว่ามีความสามารถในการจัดการข้อมูลส่วนบุคคลอย่างเหมาะสมเท่านั้น โดยโรงแรมจะเปิดเผยข้อมูลส่วนบุคคลแก่ผู้ให้บริการดังกล่าวตามขอบเขตการใช้งานและการให้บริการ และกำหนดให้ทำสัญญาเป็นลายลักษณ์อักษรหรือวิธีการที่คล้ายกันเพื่อให้มั่นใจว่าผู้ให้บริการได้มีการจัดการข้อมูลส่วนบุคคลอย่างเหมาะสม",
        "โรงแรมใช้ระบบ Hayhost Thailand เป็นผู้ประมวลผลข้อมูลส่วนบุคคลสำหรับการจอง การชำระเงิน และการแจ้งที่พักของคนต่างด้าว (ตม.30) ภายใต้ข้อตกลงการประมวลผลข้อมูล รายละเอียดผู้ให้บริการที่ Hayhost ใช้ ดูได้ที่ www.hayhostth.com/privacy",
      ] },
      { heading: "7. ระยะเวลาการจัดเก็บข้อมูลส่วนบุคคล", items: [
        "โรงแรมจะจัดเก็บข้อมูลส่วนบุคคลตามระยะเวลาที่จำเป็นเพื่อประโยชน์ในการดำเนินงานหรือการให้บริการกับเจ้าของข้อมูลส่วนบุคคล หรือตามระยะเวลาที่กฎหมายที่เกี่ยวข้องกำหนด",
      ] },
      { heading: "8. สิทธิของเจ้าของข้อมูลส่วนบุคคล", items: [
        "เจ้าของข้อมูลส่วนบุคคลมีสิทธิในการดำเนินการ ดังต่อไปนี้",
        "(1) สิทธิในการเพิกถอนความยินยอม เจ้าของข้อมูลมีสิทธิในการเพิกถอนความยินยอมในการประมวลผลข้อมูลส่วนบุคคลที่ได้ให้ความยินยอมกับโรงแรมได้ ทั้งนี้ การเพิกถอนความยินยอมย่อมไม่ส่งผลกระทบต่อการใช้ เก็บรวบรวม หรือเปิดเผยข้อมูลส่วนบุคคลที่ได้ให้ความยินยอมไว้แล้ว",
        "(2) สิทธิในการเข้าถึงข้อมูลส่วนบุคคล เจ้าของข้อมูลมีสิทธิในการเข้าถึงข้อมูลส่วนบุคคลของเจ้าของข้อมูลและขอทำสำเนาข้อมูลส่วนบุคคล ตลอดระยะเวลาที่ข้อมูลส่วนบุคคลอยู่กับโรงแรม",
        "(3) สิทธิในการให้โอนย้ายข้อมูลส่วนบุคคล เจ้าของข้อมูลมีสิทธิในการโอนย้ายข้อมูลส่วนบุคคลที่ให้ไว้กับโรงแรมไปยังผู้ควบคุมข้อมูลส่วนบุคคลอื่น เมื่อสามารถทำได้ด้วยวิธีการอัตโนมัติ และเป็นไปตามขั้นตอนที่โรงแรมกำหนด",
        "(4) สิทธิในการคัดค้านการประมวลผลข้อมูลส่วนบุคคล เจ้าของข้อมูลมีสิทธิในการคัดค้านการประมวลผลข้อมูลส่วนบุคคลของโรงแรม",
        "(5) สิทธิในการลบ ทำลาย หรือระงับการใช้ เจ้าของข้อมูลมีสิทธิร้องขอให้โรงแรมลบ ทำลาย หรือระงับการใช้ข้อมูลส่วนบุคคลที่โรงแรมเก็บรักษาไว้ หรือให้โรงแรมดำเนินการให้ข้อมูลดังกล่าวกลายเป็นข้อมูลที่ไม่สามารถใช้ระบุตัวเจ้าของข้อมูลได้ หากการดำเนินการดังกล่าวไม่ขัดต่อกฎหมาย",
        "(6) สิทธิในการแก้ไข เจ้าของข้อมูลมีสิทธิร้องขอให้โรงแรมดำเนินการแก้ไขให้ข้อมูลส่วนบุคคลที่โรงแรมจัดเก็บให้เป็นข้อมูลที่ถูกต้องและเป็นปัจจุบัน",
        "เจ้าของข้อมูลสามารถขอใช้สิทธิดังกล่าวข้างต้นได้ โดยยื่นคำร้องขอใช้สิทธิต่อโรงแรมเป็นลายลักษณ์อักษรหรือผ่านทางจดหมายอิเล็กทรอนิกส์ตามแบบฟอร์มที่โรงแรมกำหนด ผ่าน “ช่องทางการติดต่อกับโรงแรม” ด้านล่าง โดยโรงแรมจะพิจารณาและแจ้งผลการพิจารณาตามคำร้องของเจ้าของข้อมูลภายใน 30 วันนับแต่วันที่ได้รับคำร้องดังกล่าว ทั้งนี้ โรงแรมอาจปฏิเสธสิทธิของเจ้าของข้อมูลได้ในกรณีที่มีกฎหมายกำหนดไว้",
      ] },
      { heading: "9. การทบทวนและเปลี่ยนแปลงนโยบายการคุ้มครองข้อมูลส่วนบุคคล", items: [
        "โรงแรมอาจปรับปรุงหรือแก้ไขนโยบายนี้เป็นครั้งคราวตามความจำเป็นเพื่อให้สอดคล้องกับข้อกำหนดตามกฎหมาย โดยโรงแรมจะประกาศแจ้งการเปลี่ยนแปลงให้ทราบผ่านทางเว็บไซต์ของโรงแรม หรือช่องทางอื่นที่เห็นว่าเหมาะสมต่อไป",
      ] },
      { heading: "10. ช่องทางการติดต่อกับโรงแรม", items: [
        ...contactLines(hotel, { name: "ผู้ควบคุมข้อมูลส่วนบุคคล", address: "ที่อยู่", phone: "โทร", facebook: "Facebook", line: "LINE" }),
        `หากติดต่อโรงแรมไม่ได้ ส่งคำร้องถึง Hayhost Thailand ได้ที่ ${HAYHOST_SUPPORT} เราจะส่งต่อให้โรงแรมและช่วยโรงแรมดำเนินการ`,
      ] },
    ],
  };
}

function en(hotel: HotelForPrivacy): LegalDocument {
  return {
    intro: `This notice belongs to ${hotel.name} ("the Hotel"), the data controller for the personal data of guests who book and stay. The Hotel uses Hayhost Thailand to take bookings and keep booking records, as a data processor acting on the Hotel's instructions.`,
    sections: [
      { heading: "1. Definitions", items: [
        "“Personal data” means information about a person that identifies them, directly or indirectly, but not information about a deceased person.",
        "“Sensitive data” means personal information that is private and sensitive and may lead to unfair discrimination, such as race, political opinions, cult, religious or philosophical beliefs, health data, disability, or any other information that affects the data subject.",
        "“Data controller” means a person or legal entity with the authority to decide on the collection, use or disclosure of personal data.",
        "“Data processor” means a person or legal entity that collects, uses or discloses personal data on the instructions of, or on behalf of, a data controller, and is not itself the data controller.",
      ] },
      { heading: "2. Collection of personal data", items: [
        "The Hotel collects personal data for lawful purposes, within a lawful scope and by lawful means, and only as far as needed for the Hotel's operations. The Hotel makes sure data subjects are informed and give consent electronically or in the Hotel's own way. Where the Hotel collects sensitive data, it asks for explicit consent before collecting it, unless an exception under the Personal Data Protection Act B.E. 2562 (2019) or another law applies.",
      ] },
      { heading: "3. Purposes of collecting or using personal data", items: [
        "The Hotel collects or uses personal data for the purposes in this notice and for no other purpose, unless the customer consents or the law requires it:",
        "(1) For the Hotel's operations and services",
        "(2) To improve the quality and efficiency of its services",
        "(3) To meet the Hotel's contractual obligations",
        "(4) To keep personal data up to date",
        "(5) To prevent serious harm to health or life",
        "(6) For the legitimate interests of the Hotel and others, within what data subjects can reasonably expect and without affecting their rights and freedoms",
        "(7) To comply with laws and regulations that apply to the Hotel's operations",
      ] },
      { heading: "4. Disclosure of personal data", items: [
        "The Hotel does not disclose personal data to anyone without consent, and discloses it only for the purposes it has stated. To run its business and serve data subjects, the Hotel may need to disclose personal data to affiliated companies, internal auditors, external auditors, or other persons or entities as required by law.",
      ] },
      { heading: "5. Protection of personal data", items: [
        "The Hotel sets security measures for personal data in line with the law, regulations, rules and data protection guidelines for its staff and others involved, and helps its staff understand their duties in collecting, storing, using, keeping accurate and disclosing personal data. The Hotel uses suitable security measures to prevent unauthorised access, leaks, alteration or destruction of personal data. Hotel staff must follow the Hotel's data protection policy and practices so that the Hotel complies with this notice and the law.",
      ] },
      { heading: "6. Outside service providers", items: [
        "The Hotel may entrust personal data to outside service providers, including data processors. It chooses only providers confirmed to handle personal data properly, discloses personal data to them only as far as their service needs, and requires a written contract or similar arrangement so that they handle personal data properly.",
        "The Hotel uses Hayhost Thailand as data processor for bookings, payments and the foreign guest residence report (TM.30), under a data processing agreement. The providers Hayhost uses are listed at www.hayhostth.com/privacy.",
      ] },
      { heading: "7. Retention of personal data", items: [
        "The Hotel keeps personal data for as long as needed for its operations or its services to the data subject, or for as long as the relevant law requires.",
      ] },
      { heading: "8. Rights of data subjects", items: [
        "Data subjects have the following rights:",
        "(1) Right to withdraw consent. Data subjects may withdraw consent they gave the Hotel to process their personal data. Withdrawal does not affect use, collection or disclosure already made with that consent.",
        "(2) Right of access. Data subjects may access their personal data and ask for a copy for as long as the Hotel holds it.",
        "(3) Right to data portability. Data subjects may have the personal data they gave the Hotel moved to another data controller, where this can be done by automated means and follows the Hotel's procedure.",
        "(4) Right to object. Data subjects may object to the Hotel's processing of their personal data.",
        "(5) Right to erasure, destruction or restriction. Data subjects may ask the Hotel to erase, destroy or stop using the personal data it keeps, or to make it no longer identify them, where this does not conflict with the law.",
        "(6) Right to rectification. Data subjects may ask the Hotel to correct the personal data it keeps so that it is accurate and up to date.",
        "Data subjects can use these rights by sending a request to the Hotel in writing or by email, on the Hotel's form, through the contact details below. The Hotel will consider the request and reply within 30 days of receiving it. The Hotel may refuse a request where the law allows.",
      ] },
      { heading: "9. Review and changes to this notice", items: [
        "The Hotel may update this notice from time to time to keep it in line with the law, and will announce changes on the Hotel's website or through another suitable channel.",
      ] },
      { heading: "10. Contacting the Hotel", items: [
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
