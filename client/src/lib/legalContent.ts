/**
 * Draft legal pages, from the owner's Hayhost legal pack (DRAFT, 2026-11-01).
 * The notes to the lawyer are left out. Text is corrected to what the system does today,
 * so change it here when the system changes. A lawyer has not reviewed it.
 * The retention and purge wording is ahead of the system until spec 19 ships.
 */

export type LegalKind = "terms" | "privacy" | "dpa";
export type LegalTable = { head: string[]; rows: string[][] };
export type LegalSection = { heading: string; items?: string[]; table?: LegalTable };
export type LegalDocument = { intro: string; sections: LegalSection[] };

const th: Record<LegalKind, LegalDocument> = {
  terms: {
    intro: "ข้อกำหนดนี้เป็นข้อตกลงระหว่าง ธนัชชา ศรีมณี ผู้ให้บริการ Hayhost Thailand (\"ผู้ให้บริการ\" หรือ \"Hayhost\") ที่อยู่ 41/3 หมู่ 5 ตำบลปางหมู อำเภอเมือง จังหวัดแม่ฮ่องสอน กับผู้ประกอบการที่พักที่สมัครใช้บริการ (\"ผู้ใช้บริการ\" หรือ \"โรงแรม\") การสมัครหรือใช้บริการถือว่าผู้ใช้บริการได้อ่าน เข้าใจ และตกลงตามข้อกำหนดนี้",
    sections: [
      { heading: "ข้อ 1. คำนิยาม", items: [
        "1.1 \"บริการ\" หมายถึง ระบบ Hayhost ที่ให้บริการผ่าน www.hayhostth.com รวมถึงหน้าจองออนไลน์และเว็บไซต์ของโรงแรมที่สร้างผ่านระบบ",
        "1.2 \"ผู้ใช้\" หมายถึง เจ้าของ ผู้จัดการ และพนักงานของโรงแรมที่ได้รับบัญชีเข้าใช้ระบบ",
        "1.3 \"แขก\" หมายถึง ผู้เข้าพักหรือผู้จองห้องพักของโรงแรม",
        "1.4 \"ข้อมูลของโรงแรม\" หมายถึง ข้อมูลทั้งหมดที่โรงแรมหรือแขกบันทึกเข้าสู่ระบบ รวมถึงข้อมูลส่วนบุคคลของแขก",
      ] },
      { heading: "ข้อ 2. บริการที่ให้", items: [
        "2.1 บริหารห้องพัก ประเภทห้อง ราคา และห้องว่าง บันทึกและจัดการการจองตลอดวงจร งานแม่บ้าน รายงานการเงิน ส่งออกแบบ ตม.30 หน้าจองและเว็บไซต์ของโรงแรม บริการนี้ไม่รวมการเชื่อมต่อกับ OTA",
        "2.2 ผู้ให้บริการอาจปรับปรุง เพิ่ม หรือยกเลิกฟีเจอร์ โดยจะแจ้งล่วงหน้าอย่างสมเหตุสมผลหากการเปลี่ยนแปลงกระทบการใช้งานหลักอย่างมีนัยสำคัญ",
      ] },
      { heading: "ข้อ 3. การสมัครและบัญชีผู้ใช้", items: [
        "3.1 โรงแรมต้องให้ข้อมูลที่ถูกต้อง และรับผิดชอบการเชิญ กำหนดสิทธิ์ และยกเลิกบัญชีของพนักงาน",
        "3.2 ผู้ใช้ต้องเก็บรักษารหัสผ่านและอุปกรณ์ยืนยันตัวตนสองชั้นเป็นความลับ การยืนยันตัวตนสองชั้นเป็นทางเลือกสำหรับบัญชีโรงแรม",
        "3.3 โรงแรมต้องแจ้งผู้ให้บริการทันทีเมื่อสงสัยว่าบัญชีถูกใช้งานโดยไม่ได้รับอนุญาต",
      ] },
      { heading: "ข้อ 4. ค่าบริการ", items: [
        "4.1 อัตราค่าบริการและเงื่อนไขแพ็กเกจเป็นไปตามที่ผู้ให้บริการประกาศกำหนดไว้บนหน้าเว็บไซต์หรือแอปพลิเคชัน ณ วันทำรายการ ปัจจุบันยังไม่มีการเรียกเก็บค่าบริการ",
        "4.2 การคืนเงินค่าบริการ: ผู้ใช้บริการแจ้งยกเลิกบริการได้ทุกเมื่อ ผู้ให้บริการจะคืนเงินค่าบริการสำหรับระยะเวลาที่เหลือของรอบการชำระปัจจุบัน ตามสูตร (ค่าบริการที่ชำระจริงในรอบนั้น ÷ 30) × จำนวนวันที่เหลือ นับจากวันถัดจากวันที่แจ้งยกเลิกจนถึงวันสิ้นสุดรอบ เงินคืนต่ำสุดเป็นศูนย์บาท และปัดเศษสตางค์ลง",
        "บริการหยุดให้ใช้งานในวันที่แจ้งยกเลิก และสิ้นสุดเมื่อครบกำหนดตามข้อ 7.3 ผู้ให้บริการจะตรวจสอบข้อเท็จจริงและยอดเงินภายใน 7 วันนับจากวันที่แจ้ง แล้วคืนเงินเข้าบัญชีพร้อมเพย์ที่ตั้งไว้ในระบบ หรือบัญชีธนาคารที่ผู้ใช้บริการแจ้ง ภายใน 15 วันนับจากวันที่แจ้ง โดยบัญชีต้องเป็นชื่อเดียวกับผู้ลงทะเบียนใช้บริการ หากชื่อบัญชีไม่ตรง ผู้ให้บริการมีสิทธิระงับการคืนเงินจนกว่าจะยืนยันตัวตนเพิ่มเติมแล้วเสร็จ เพื่อป้องกันการโจรกรรมบัญชีและการฟอกเงิน หากยกเลิกการปิดที่พักตามข้อ 7.3 จะไม่มีการคืนเงิน",
        "ตัวอย่าง: แพ็กเกจเดือนละ 900 บาท ใช้ไป 10 วันแล้วแจ้งยกเลิก ได้รับเงินคืน (900 ÷ 30) × 20 = 600 บาท",
        "4.3 ข้อยกเว้น: ผู้ให้บริการไม่คืนเงินค่าบริการ ในกรณีที่บัญชีถูกระงับหรือยกเลิกเนื่องจากผู้ใช้บริการฝ่าฝืนข้อกำหนดนี้หรือใช้บริการโดยมิชอบด้วยกฎหมาย ตามข้อ 11.1",
        "4.4 การเปลี่ยนแพ็กเกจ: อัปเกรดได้ทุกเมื่อ โดยชำระส่วนต่างตามสูตร (ค่าบริการแพ็กเกจใหม่ − ค่าบริการแพ็กเกจเดิม) ÷ 30 × จำนวนวันที่เหลือของรอบ แพ็กเกจใหม่มีผลทันทีเมื่อชำระเงินแล้ว และรอบถัดไปคิดตามราคาใหม่โดยไม่เปลี่ยนวันตัดรอบ",
        "การลดแพ็กเกจมีผลในรอบการชำระถัดไป โดยไม่มีการคืนเงินส่วนต่าง หากข้อมูลเกินขีดจำกัดของแพ็กเกจใหม่ ผู้ใช้บริการต้องปรับข้อมูลให้อยู่ในขีดจำกัดก่อนวันที่การลดแพ็กเกจมีผล",
        "ตัวอย่าง: แพ็กเกจเดิมเดือนละ 900 บาท อัปเกรดเป็นเดือนละ 1,500 บาท เมื่อรอบปัจจุบันเหลือ 20 วัน ชำระเพิ่ม (1,500 − 900) ÷ 30 × 20 = 400 บาท",
        "4.5 ผู้ให้บริการอาจปรับค่าบริการโดยแจ้งล่วงหน้าไม่น้อยกว่า 30 วัน",
      ] },
      { heading: "ข้อ 5. การรับชำระเงินจากแขก", items: [
        "5.1 เงินที่แขกชำระ (พร้อมเพย์ โอนเงิน หรือเงินสด) เข้าบัญชีของโรงแรมโดยตรง ผู้ให้บริการไม่ได้รับ ถือ หรือโอนเงินแทนโรงแรม",
        "5.2 การตรวจสลิปอัตโนมัติใช้บริการของ SlipOK ด้วย API key ของโรงแรมเอง ผลการตรวจเป็นเครื่องมือช่วย โรงแรมยังต้องรับผิดชอบการตรวจสอบยอดเงินในบัญชีของตนเอง",
        "5.3 การจองออนไลน์ที่ยังไม่ชำระเงินจะถูกพักห้องไว้ชั่วคราว เมื่อหมดเวลา ระบบจะปล่อยห้องคืนอัตโนมัติ",
        "5.4 เงื่อนไขการยกเลิกและการคืนเงินให้แขกเป็นความรับผิดชอบของโรงแรม ระบบเพียงบันทึกสถานะการคืนเงิน",
      ] },
      { heading: "ข้อ 6. หน้าที่ของโรงแรม", items: [
        "6.1 ใช้บริการโดยชอบด้วยกฎหมาย รวมถึงกฎหมายโรงแรม กฎหมายคนเข้าเมือง (การแจ้ง ตม.30) และกฎหมายคุ้มครองข้อมูลส่วนบุคคล",
        "6.2 ในฐานะผู้ควบคุมข้อมูลของแขก โรงแรมต้องมีฐานทางกฎหมายในการเก็บข้อมูล แจ้งนโยบายความเป็นส่วนตัวของโรงแรมให้แขกทราบ และตอบสนองคำขอใช้สิทธิของแขก",
        "6.3 ตรวจสอบความถูกต้องของราคาและห้องว่างในระบบเป็นระยะ รวมถึงการจองที่รับจากช่องทางอื่นนอกระบบ ซึ่งโรงแรมต้องบันทึกหรือปรับเอง",
        "6.4 ไม่ใช้บริการเพื่อส่งข้อความรบกวน หลอกลวง หรือเผยแพร่เนื้อหาที่ผิดกฎหมายบนเว็บไซต์ของโรงแรม",
        "6.5 จัดให้มีมาตรการความปลอดภัยและควบคุมพนักงานของตนในการเข้าถึงและรักษาความลับของข้อมูลแขก หากข้อมูลรั่วไหลเพราะอุปกรณ์หรือบุคลากรของผู้ใช้บริการเอง ผู้ใช้บริการต้องรับผิดชอบตามกฎหมาย",
      ] },
      { heading: "ข้อ 7. ข้อมูลของโรงแรมและข้อมูลส่วนบุคคล", items: [
        "7.1 ข้อมูลของโรงแรมเป็นของโรงแรม ผู้ให้บริการใช้ข้อมูลดังกล่าวเพื่อให้บริการเท่านั้น ตามข้อตกลงการประมวลผลข้อมูลส่วนบุคคล ซึ่งถือเป็นส่วนหนึ่งของข้อกำหนดนี้",
        "7.2 ระบบแยกข้อมูลของแต่ละโรงแรมออกจากกัน ผู้ใช้เข้าถึงได้เฉพาะโรงแรมที่ได้รับสิทธิ์ และตามสิทธิ์ที่กำหนดให้แต่ละบทบาท",
        "7.3 เจ้าของที่พักปิดที่พักได้ในระบบ และยกเลิกได้ภายใน 7 วันนับจากวันที่แจ้ง เมื่อครบ 7 วันถือว่าสิ้นสุดการใช้บริการของที่พักนั้น โรงแรมดาวน์โหลดข้อมูลได้อีก 30 วัน และผู้ให้บริการจะลบข้อมูลภายใน 60 วันนับจากวันที่สิ้นสุด เว้นแต่กฎหมายกำหนดให้เก็บต่อ โรงแรมมีหน้าที่ดาวน์โหลดและเก็บเอกสารที่กฎหมายกำหนดให้โรงแรมต้องเก็บไว้เอง",
      ] },
      { heading: "ข้อ 8. การเข้าถึงข้อมูลโดยทีมงาน", items: [
        "8.1 ทีมซัพพอร์ตจะเข้าถึงข้อมูลของโรงแรมเพื่อแก้ปัญหาได้ก็ต่อเมื่อโรงแรมอนุญาตผ่านระบบเท่านั้น โดยกำหนดได้ว่าให้ดูอย่างเดียวหรือแก้ไขได้ และมีวันหมดอายุ",
        "8.2 โรงแรมเพิกถอนสิทธิ์ได้ทุกเมื่อ และการเข้าถึงของทีมซัพพอร์ตถูกบันทึกเป็นหลักฐาน",
        "8.3 ผู้ดูแลระบบของผู้ให้บริการไม่เห็นการจองหรือข้อมูลแขกผ่านหน้าจอของระบบ แต่ผู้ให้บริการยังเข้าถึงข้อมูลในระดับโครงสร้างพื้นฐานได้ และจะทำเท่าที่จำเป็นเพื่อดูแลระบบ รักษาความปลอดภัย หรือปฏิบัติตามกฎหมายหรือคำสั่งของหน่วยงานรัฐ",
      ] },
      { heading: "ข้อ 9. ความพร้อมให้บริการ", items: [
        "9.1 ผู้ให้บริการจะพยายามให้บริการอย่างต่อเนื่อง แต่ไม่รับประกันว่าบริการจะไม่หยุดชะงักหรือไม่มีข้อผิดพลาด เนื่องจากอาศัยโครงสร้างพื้นฐานของผู้ให้บริการภายนอก",
        "9.2 ผู้ให้บริการอาจหยุดให้บริการชั่วคราวเพื่อบำรุงรักษา โดยจะแจ้งล่วงหน้าเมื่อทำได้",
      ] },
      { heading: "ข้อ 10. ข้อจำกัดความรับผิด", items: [
        "10.1 ผู้ให้บริการไม่รับผิดต่อความเสียหายทางอ้อม ความเสียหายเชิงลงโทษ การสูญเสียรายได้หรือผลกำไรทางธุรกิจ รวมถึงการจองซ้อน (overbooking) ที่เกิดจากการตั้งค่าของโรงแรมหรือการจองผ่านช่องทางอื่นนอกระบบ",
        "10.2 ความรับผิดรวมของผู้ให้บริการไม่เกินจำนวนค่าบริการที่ผู้ใช้บริการชำระจริงในรอบ 12 เดือนล่าสุดก่อนเกิดเหตุ หรือตามระยะเวลาที่ใช้บริการจริงหากน้อยกว่า 12 เดือน",
        "10.3 ข้อ 10.1 และ 10.2 ไม่ตัดความรับผิดเพื่อกลฉ้อฉลหรือความประมาทเลินเล่ออย่างร้ายแรงของผู้ให้บริการ และความรับผิดอื่นที่กฎหมายห้ามมิให้จำกัด",
      ] },
      { heading: "ข้อ 11. การระงับและการยกเลิกบริการ", items: [
        "11.1 ผู้ให้บริการอาจระงับบัญชีที่ใช้บริการผิดข้อกำหนด ผิดกฎหมาย หรือค้างชำระ โดยแจ้งเหตุผลให้ทราบ",
        "11.2 โรงแรมยกเลิกบริการได้ทุกเมื่อ ตามเงื่อนไขค่าบริการในข้อ 4",
      ] },
      { heading: "ข้อ 12. ทรัพย์สินทางปัญญา", items: [
        "12.1 ซอฟต์แวร์ เครื่องหมายการค้า และเนื้อหาของระบบเป็นของผู้ให้บริการ โรงแรมได้รับสิทธิ์ใช้งานแบบไม่ผูกขาดตลอดระยะเวลาที่ใช้บริการ",
        "12.2 เนื้อหาที่โรงแรมอัปโหลด เช่นรูปภาพและคำบรรยาย ยังเป็นของโรงแรม โรงแรมอนุญาตให้ผู้ให้บริการใช้เพื่อแสดงบนหน้าเว็บไซต์และหน้าจองของโรงแรมเท่านั้น และรับรองว่ามีสิทธิ์ในเนื้อหานั้น",
      ] },
      { heading: "ข้อ 13. การแก้ไขข้อกำหนด", items: [
        "13.1 ผู้ให้บริการอาจแก้ไขข้อกำหนดนี้ โดยแจ้งผ่านระบบหรืออีเมลล่วงหน้าไม่น้อยกว่า 30 วัน การใช้บริการต่อหลังวันที่มีผลถือว่ายอมรับข้อกำหนดใหม่",
      ] },
      { heading: "ข้อ 14. การโอนสิทธิและหน้าที่", items: [
        "14.1 ผู้ให้บริการอาจโอนสิทธิและหน้าที่ตามข้อกำหนดนี้ทั้งหมดหรือบางส่วนให้แก่นิติบุคคลที่ผู้ให้บริการจัดตั้งหรือเป็นผู้ถือหุ้น โดยแจ้งล่วงหน้าไม่น้อยกว่า 30 วัน การโอนดังกล่าวไม่กระทบสิทธิของผู้ใช้บริการ รวมถึงข้อมูลของโรงแรมและเงื่อนไขการคืนเงิน",
        "14.2 ผู้ใช้บริการจะโอนสิทธิตามข้อกำหนดนี้ให้บุคคลอื่นไม่ได้ เว้นแต่ได้รับความยินยอมเป็นหนังสือจากผู้ให้บริการ",
      ] },
      { heading: "ข้อ 15. กฎหมายที่ใช้บังคับ", items: ["15.1 ข้อกำหนดและความตกลงนี้ให้อยู่ภายใต้บังคับและตีความตามกฎหมายไทย ข้อพิพาทใด ๆ ที่เกิดขึ้นจากหรือเกี่ยวข้องกับข้อกำหนดนี้ ให้อยู่ในเขตอำนาจของศาลที่มีเขตอำนาจเหนือภูมิลำเนาของผู้ให้บริการ เว้นแต่บทบัญญัติแห่งกฎหมายที่มีผลใช้บังคับจะกำหนดไว้เป็นอย่างอื่นโดยเด็ดขาด"] },
    ],
  },
  privacy: {
    intro: "ธนัชชา ศรีมณี ผู้ให้บริการ Hayhost Thailand (\"เรา\") ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) นโยบายนี้อธิบายว่าเราเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลอย่างไร",
    sections: [
      { heading: "ข้อ 1. นโยบายนี้ใช้กับใคร", items: [
        "1.1 ผู้ประกอบการที่พัก เจ้าของ และพนักงานที่มีบัญชีในระบบ Hayhost เราเป็นผู้ควบคุมข้อมูล",
        "1.2 ผู้เข้าชมเว็บไซต์ www.hayhostth.com และผู้ติดต่อเรา เราเป็นผู้ควบคุมข้อมูล",
        "1.3 แขกของโรงแรม โรงแรมแต่ละแห่งเป็นผู้ควบคุมข้อมูล เราประมวลผลข้อมูลแขกในฐานะผู้ประมวลผลข้อมูลตามคำสั่งของโรงแรม แขกควรอ่านนโยบายความเป็นส่วนตัวของโรงแรมนั้นด้วย และส่งคำขอใช้สิทธิไปที่โรงแรมเป็นหลัก ยกเว้นข้อมูลทางเทคนิคตอนสร้างการจองออนไลน์ ซึ่งเราเก็บเพื่อความปลอดภัยของระบบในฐานะผู้ควบคุมข้อมูล",
      ] },
      { heading: "ข้อ 2. ข้อมูลที่เราเก็บ", items: ["ผู้ใช้ต้องให้ชื่อและอีเมล และโรงแรมต้องให้ข้อมูลที่พัก เพื่อเข้าทำสัญญาและใช้บริการ หากไม่ให้ เราจะเปิดบัญชีหรือให้บริการไม่ได้"], table: { head: ["กลุ่ม", "ข้อมูล", "ที่มา"], rows: [
        ["บัญชีผู้ใช้", "ชื่อ อีเมล รหัสผ่าน ข้อมูลยืนยันตัวตนสองชั้น บทบาทและสิทธิ์", "ผู้ใช้กรอกเอง / โรงแรมเชิญ"],
        ["การใช้งานระบบ", "หมายเลข IP ข้อมูลเบราว์เซอร์ บันทึกการใช้งานที่สำคัญ (audit log) และข้อมูลทางเทคนิคเพื่อป้องกันการใช้งานผิดปกติ", "เก็บอัตโนมัติ"],
        ["การเข้าชมเว็บไซต์", "สถิติการเข้าชมแบบไม่ใช้คุกกี้", "เก็บอัตโนมัติ"],
        ["ข้อมูลโรงแรม", "ชื่อ ที่อยู่ ช่องทางติดต่อเจ้าของ บัญชีพร้อมเพย์ ช่องทางที่รู้จักเรา", "โรงแรมกรอก"],
        ["การคืนเงินค่าบริการ", "ชื่อและเลขบัญชีรับเงินคืน และเอกสารยืนยันตัวตนเมื่อชื่อบัญชีไม่ตรงกับผู้ลงทะเบียน", "โรงแรมกรอกหรือส่งให้เรา"],
        ["ตัวแทนขาย", "ชื่อ เบอร์โทร อีเมล", "ตัวแทนหรือเรากรอก"],
        ["ข้อมูลแขก (ในฐานะผู้ประมวลผล)", "ชื่อผู้จอง วันเข้าพัก จำนวนผู้เข้าพัก สถานะการจองและการชำระเงิน ข้อมูลสลิปและผลการตรวจสลิป ความยินยอมทางการตลาด และสำหรับ ตม.30: ชื่อ-นามสกุล เพศ เลขหนังสือเดินทาง สัญชาติ วันเกิด เบอร์โทร", "โรงแรมบันทึก / แขกกรอกผ่านหน้าจอง"],
      ] } },
      { heading: "ข้อ 3. วัตถุประสงค์และฐานทางกฎหมาย", table: { head: ["วัตถุประสงค์", "ฐานทางกฎหมาย"], rows: [
        ["สร้างและดูแลบัญชี ให้บริการตามสัญญา ส่งอีเมลเชิญและรีเซ็ตรหัสผ่าน", "การปฏิบัติตามสัญญา (มาตรา 24(3))"],
        ["รักษาความปลอดภัย ป้องกันการเข้าถึงโดยมิชอบ เก็บ audit log", "ประโยชน์โดยชอบด้วยกฎหมาย (มาตรา 24(5))"],
        ["ออกใบแจ้งหนี้และเก็บเอกสารบัญชี", "หน้าที่ตามกฎหมาย (มาตรา 24(6))"],
        ["เก็บข้อมูลระบุตัวผู้ใช้บริการ 90 วันหลังเลิกใช้บริการ ตาม พ.ร.บ.ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ มาตรา 26", "หน้าที่ตามกฎหมาย (มาตรา 24(6))"],
        ["ตรวจสอบบัญชีรับเงินคืน ป้องกันการโจรกรรมบัญชีและการฟอกเงิน", "การปฏิบัติตามสัญญา (มาตรา 24(3)) และประโยชน์โดยชอบด้วยกฎหมาย (มาตรา 24(5))"],
        ["ส่งข่าวสารผลิตภัณฑ์ให้โรงแรม", "ความยินยอม หรือประโยชน์โดยชอบด้วยกฎหมาย"],
        ["ประมวลผลข้อมูลแขก", "ตามคำสั่งของโรงแรม (ผู้ควบคุมข้อมูล) ภายใต้ข้อตกลงการประมวลผลข้อมูล"],
      ] } },
      { heading: "ข้อ 4. การเปิดเผยข้อมูล", items: [
        "4.1 เราไม่ขายข้อมูลส่วนบุคคล",
        "4.2 เราเปิดเผยข้อมูลให้ผู้ให้บริการที่จำเป็นต่อการให้บริการ ตามกลุ่มในข้อ 12",
        "4.3 เปิดเผยต่อหน่วยงานรัฐเมื่อกฎหมายกำหนด",
      ] },
      { heading: "ข้อ 5. การส่งข้อมูลไปต่างประเทศ", items: ["5.1 ผู้ให้บริการบางรายของเราประมวลผลข้อมูลนอกประเทศไทย เช่นในสหรัฐอเมริกา บริการโครงสร้างพื้นฐานบนคลาวด์และบริการส่งอีเมลจึงอาจจัดเก็บหรือส่งข้อมูลไปยังเซิร์ฟเวอร์ในต่างประเทศ เราจะส่งหรือโอนข้อมูลตามมาตรา 28 และมาตรา 29 และประกาศคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลเรื่องหลักเกณฑ์การให้ความคุ้มครองข้อมูลส่วนบุคคลที่ส่งหรือโอนไปยังต่างประเทศ พ.ศ. 2566 โดยใช้มาตรการคุ้มครองตามข้อสัญญามาตรฐานสากลกับผู้ให้บริการที่รับข้อมูล"] },
      { heading: "ข้อ 6. ระยะเวลาการเก็บรักษา", items: ["เมื่อโรงแรมปิดที่พัก ระบบจะลบข้อมูลของที่พักนั้นอัตโนมัติตามข้อตกลงการประมวลผลข้อมูล เมื่อครบระยะเวลาด้านล่าง เราจะทำลายข้อมูลหรือทำให้ไม่สามารถระบุตัวบุคคลได้ตามรอบการประมวลผลของระบบ"], table: { head: ["ข้อมูล", "ระยะเวลา"], rows: [
        ["บัญชีผู้ใช้", "ตลอดระยะเวลาใช้บริการ เมื่อลบบัญชี ระบบนำตัวตนของเจ้าของบัญชีออก แต่ระเบียนการจอง การเงิน และ audit log ยังคงอยู่ โดยนำตัวตนออกเท่าที่ระบบจับคู่ได้ ข้อความอิสระที่พิมพ์ไว้อาจยังมีชื่ออยู่"],
        ["ข้อมูลระบุตัวผู้ใช้บริการ (เช่น อีเมลที่ลงทะเบียน ช่วงเวลาที่ใช้บริการ และ IP)", "90 วันนับจากวันที่เลิกใช้บริการ ตาม พ.ร.บ.ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ มาตรา 26 ระหว่างนี้เราลบตามคำขอไม่ได้ ตามมาตรา 33 วรรคสอง แห่ง PDPA"],
        ["Session และ IP", "ตามอายุ session"],
        ["Audit log และบันทึกการเข้าถึงของทีมซัพพอร์ต", "3 ปีนับจากวันที่บันทึก เพื่อการรักษาความมั่นคงปลอดภัยและการปกป้องสิทธิเรียกร้องทางกฎหมาย หรือจนกว่าที่พักจะถูกลบ แล้วแต่อย่างใดถึงก่อน"],
        ["เอกสารบัญชี ใบแจ้งหนี้ บันทึกการรับชำระเงิน สลิป และข้อมูลการคืนเงินค่าบริการ", "5 ปี เพื่อการตรวจสอบภาษีตามประมวลรัษฎากร"],
        ["ข้อมูลแขก", "ตามที่โรงแรมกำหนด และตามข้อตกลงการประมวลผลข้อมูลเมื่อเลิกใช้บริการ"],
      ] } },
      { heading: "ข้อ 7. ความปลอดภัย", items: [
        "7.1 เราใช้มาตรการทางเทคนิคและการจัดการที่เหมาะสม เช่น เข้ารหัสการรับส่งข้อมูล แยกข้อมูลแต่ละโรงแรม ควบคุมสิทธิ์ตามบทบาท และบันทึกการเข้าถึง",
        "7.2 หากเกิดการละเมิดข้อมูลที่เราเป็นผู้ควบคุม เราจะแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลโดยไม่ชักช้าภายใน 72 ชั่วโมงนับแต่ทราบเหตุเท่าที่ทำได้ เว้นแต่เหตุนั้นไม่มีความเสี่ยงที่จะกระทบสิทธิและเสรีภาพของบุคคล หากมีความเสี่ยงสูง เราจะแจ้งเจ้าของข้อมูลพร้อมแนวทางเยียวยาด้วย ส่วนข้อมูลแขก เราจะแจ้งโรงแรมตามข้อตกลงการประมวลผลข้อมูล",
      ] },
      { heading: "ข้อ 8. คุกกี้และการเก็บข้อมูลในเบราว์เซอร์", items: [
        "8.1 เราใช้คุกกี้ที่จำเป็นต่อการล็อกอินและรักษาความปลอดภัยของ session ไม่ใช้คุกกี้เพื่อการโฆษณา",
        "8.2 เราเก็บค่าที่คุณเลือก เช่นภาษาและโรงแรมที่กำลังใช้งาน ไว้ในเบราว์เซอร์ของคุณ และนับสถิติการเข้าชมโดยไม่ใช้คุกกี้ หากเพิ่มการวิเคราะห์หรือโฆษณาที่ต้องใช้คุกกี้ เราจะขอความยินยอมก่อน",
      ] },
      { heading: "ข้อ 9. สิทธิของเจ้าของข้อมูลและการขอลบข้อมูล", items: [
        "9.1 ท่านมีสิทธิขอเข้าถึงและรับสำเนา ขอให้แก้ไข ขอให้ลบหรือทำลาย ขอให้ระงับการใช้ คัดค้านการประมวลผล ขอโอนย้ายข้อมูล และถอนความยินยอม เราจะตอบโดยไม่ชักช้า คำขอเข้าถึงและรับสำเนาไม่เกิน 30 วัน (ขยายได้อีกไม่เกิน 30 วันเมื่อมีเหตุจำเป็นและแจ้งให้ทราบ) และคำขอลบไม่เกิน 90 วันนับจากวันที่ได้รับคำขอ",
        "9.2 ผู้มีบัญชีลบบัญชีของตนเองได้ที่หน้าการตั้งค่าความปลอดภัย หรือส่งอีเมลหัวข้อ \"ขอลบข้อมูล\" มาที่ support@hayhostth.com จากอีเมลของบัญชี",
        "9.3 แขกของโรงแรมโปรดติดต่อโรงแรมโดยตรง หากส่งคำขอมาที่เรา เราจะส่งต่อให้โรงแรมและช่วยโรงแรมดำเนินการ",
        "9.4 ท่านมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล",
      ] },
      { heading: "ข้อ 10. ช่องทางติดต่อ", items: ["10.1 ผู้ควบคุมข้อมูล: ธนัชชา ศรีมณี (Hayhost Thailand) ที่อยู่ 41/3 หมู่ 5 ตำบลปางหมู อำเภอเมือง จังหวัดแม่ฮ่องสอน โทร 061-512-5679 อีเมล: support@hayhostth.com"] },
      { heading: "ข้อ 11. การเปลี่ยนแปลงนโยบาย", items: ["11.1 เราอาจปรับปรุงนโยบายนี้ และจะแจ้งการเปลี่ยนแปลงที่สำคัญผ่านระบบหรืออีเมล พร้อมระบุวันที่มีผลบังคับ"] },
      { heading: "ข้อ 12. ผู้ให้บริการที่เราใช้", table: { head: ["กลุ่มผู้ให้บริการ", "ใช้ทำอะไร", "ที่ตั้งการประมวลผล"], rows: [
        ["ผู้ให้บริการคลาวด์", "โฮสต์ระบบ เก็บข้อมูลและไฟล์ และสถิติการเข้าชม", "ในและนอกประเทศไทย รวมถึงสหรัฐฯ"],
        ["ผู้ให้บริการอีเมล", "ส่งอีเมลของระบบ และรับอีเมลที่ส่งถึงทีมงาน", "นอกประเทศไทย รวมถึงสหรัฐฯ"],
       ["ผู้ให้บริการตรวจสลิป", "ตรวจสลิปโอนเงิน เมื่อโรงแรมเปิดใช้", "บริษัทตั้งอยู่ในประเทศไทย"],
      ] } },
    ],
  },
  dpa: {
    intro: "ข้อตกลงนี้เป็นส่วนหนึ่งของข้อกำหนดการใช้บริการ ระหว่างโรงแรม (\"ผู้ควบคุมข้อมูล\") และ Hayhost (\"ผู้ประมวลผลข้อมูล\") ตามมาตรา 40 แห่ง PDPA",
    sections: [
      { heading: "ข้อ 1. ขอบเขต", items: [
        "1.1 ข้อมูลส่วนบุคคลของแขก (ชื่อ ข้อมูลการจอง ข้อมูลการชำระเงินและสลิป ข้อมูลสำหรับ ตม.30 ความยินยอมทางการตลาด) และของพนักงานโรงแรมในส่วนที่โรงแรมบันทึก",
        "1.2 วัตถุประสงค์: ให้บริการตามข้อกำหนดการใช้บริการเท่านั้น ระยะเวลา: ตลอดระยะเวลาใช้บริการและช่วงส่งคืนหรือลบข้อมูลตามข้อ 7",
      ] },
      { heading: "ข้อ 2. หน้าที่ของผู้ประมวลผลข้อมูล", items: [
        "2.1 ประมวลผลตามคำสั่งที่เป็นลายลักษณ์อักษรของผู้ควบคุมข้อมูลเท่านั้น เว้นแต่คำสั่งนั้นขัดต่อกฎหมาย โดยข้อตกลงนี้ การตั้งค่า และการใช้งานระบบถือเป็นคำสั่ง",
        "2.2 ไม่ใช้ข้อมูลของแขกเพื่อวัตถุประสงค์ของตนเอง รวมถึงไม่นำไปทำการตลาดหรือฝึกโมเดล AI",
        "2.3 จัดให้บุคลากรที่เข้าถึงข้อมูลมีหน้าที่รักษาความลับ",
        "2.4 จัดให้มีมาตรการความปลอดภัยตามข้อ 7 ของนโยบายความเป็นส่วนตัว",
        "2.5 จัดทำและเก็บรักษาบันทึกรายการของกิจกรรมการประมวลผลตามมาตรา 40 (3)",
      ] },
      { heading: "ข้อ 3. หน้าที่ของผู้ควบคุมข้อมูล", items: [
        "3.1 มีฐานทางกฎหมายในการเก็บข้อมูลแขก และแจ้งนโยบายความเป็นส่วนตัวของโรงแรมแก่แขก",
        "3.2 กำหนดสิทธิ์ผู้ใช้ภายในโรงแรมให้เหมาะสม และควรใช้ฟีเจอร์ยืนยันตัวตนสองชั้นกับผู้ใช้ที่มีสิทธิ์สูง",
      ] },
      { heading: "ข้อ 4. ผู้ประมวลผลข้อมูลช่วง", items: [
        "4.1 ผู้ควบคุมข้อมูลอนุญาตให้ใช้ผู้ประมวลผลข้อมูลช่วงตามกลุ่มในข้อ 12 ของนโยบายความเป็นส่วนตัว และผู้ประมวลผลข้อมูลจะแจ้งรายชื่อเมื่อผู้ควบคุมข้อมูลร้องขอ",
        "4.2 ผู้ประมวลผลข้อมูลจะแจ้งล่วงหน้า 30 วัน ก่อนเพิ่มหรือเปลี่ยนผู้ประมวลผลข้อมูลช่วง ผู้ควบคุมข้อมูลคัดค้านได้ด้วยเหตุผลอันสมควร",
      ] },
      { heading: "ข้อ 5. การส่งข้อมูลไปต่างประเทศ", items: ["5.1 ผู้ประมวลผลข้อมูลจะส่งหรือโอนข้อมูลไปต่างประเทศเฉพาะผ่านผู้ประมวลผลข้อมูลช่วงตามข้อ 4 และตามมาตรา 28 และมาตรา 29 กับประกาศคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลที่เกี่ยวข้อง"] },
      { heading: "ข้อ 6. การเข้าถึงโดยทีมงาน", items: [
        "6.1 ทีมซัพพอร์ตเข้าถึงข้อมูลของโรงแรมได้เมื่อโรงแรมอนุญาตผ่านระบบเท่านั้น จำกัดโหมด (ดูอย่างเดียวหรือแก้ไข) และระยะเวลา เพิกถอนได้ และบันทึกการเข้าถึง",
        "6.2 หน้าจอของผู้ดูแลระบบไม่แสดงการจองหรือข้อมูลแขก ผู้ควบคุมข้อมูลอนุญาตให้ผู้ประมวลผลข้อมูลเข้าถึงฐานข้อมูลในระดับโครงสร้างพื้นฐานได้เท่าที่จำเป็นเพื่อดูแลระบบ รักษาความปลอดภัย หรือปฏิบัติตามกฎหมาย",
      ] },
      { heading: "ข้อ 7. การสิ้นสุดและการลบข้อมูล", items: ["7.1 เมื่อสิ้นสุดการใช้บริการตามข้อ 7.3 ของข้อกำหนดการใช้บริการ ผู้ประมวลผลข้อมูลจะให้ผู้ควบคุมข้อมูลส่งออกข้อมูลภายใน 30 วัน แล้วลบข้อมูลภายใน 60 วันนับจากวันที่สิ้นสุด รวมถึงในสำเนาสำรองตามรอบการสำรองข้อมูล เว้นแต่กฎหมายกำหนดให้เก็บ ระหว่างรอรอบดังกล่าว ผู้ประมวลผลข้อมูลจะไม่เข้าถึงหรือนำสำเนาสำรองนั้นมาใช้"] },
      { heading: "ข้อ 8. การแจ้งเหตุละเมิด", items: ["8.1 แจ้งผู้ควบคุมข้อมูลโดยไม่ชักช้า ภายใน 48 ชั่วโมงนับแต่ทราบเหตุ พร้อมข้อมูลเท่าที่มีเพื่อให้ผู้ควบคุมข้อมูลแจ้งสำนักงานฯ ได้ภายใน 72 ชั่วโมง"] },
      { heading: "ข้อ 9. การช่วยเหลือผู้ควบคุมข้อมูล", items: ["9.1 ช่วยตอบคำขอใช้สิทธิของแขก (เช่นส่งออก แก้ไข หรือลบข้อมูล) และให้ข้อมูลที่จำเป็นเพื่อพิสูจน์การปฏิบัติตามข้อตกลงนี้"] },
    ],
  },
};

const en: Record<LegalKind, LegalDocument> = {
  terms: {
    intro: "These terms are an agreement between Tanutcha Srimanee, provider of Hayhost Thailand (\"the Provider\" or \"Hayhost\"), of 41/3 Moo 5, Pang Mu, Mueang Mae Hong Son, Mae Hong Son, and the accommodation operator that signs up (\"the Customer\" or \"the Hotel\"). By signing up or using the service, the Customer has read, understood and agreed to these terms.",
    sections: [
      { heading: "1. Definitions", items: [
        "1.1 \"Service\" means the Hayhost system provided at www.hayhostth.com, including booking pages and hotel websites created through it.",
        "1.2 \"User\" means an owner, manager or staff member of a Hotel who has an account.",
        "1.3 \"Guest\" means a person who stays at or books with a Hotel.",
        "1.4 \"Hotel Data\" means all data the Hotel or its Guests enter into the system, including Guests' personal data.",
      ] },
      { heading: "2. The Service", items: [
        "2.1 Managing rooms, room types, rates and availability; recording and managing bookings through their life cycle; housekeeping; financial reports; TM.30 export; and booking pages and hotel websites. The Service does not include any connection to OTAs.",
        "2.2 The Provider may improve, add or remove features, and will give reasonable notice if a change materially affects core use.",
      ] },
      { heading: "3. Signing up and accounts", items: [
        "3.1 The Hotel must give accurate information and is responsible for inviting staff, setting their permissions and closing their accounts.",
        "3.2 Users must keep passwords and two-factor devices private. Two-factor authentication is optional for hotel accounts.",
        "3.3 The Hotel must tell the Provider at once if it suspects unauthorised use of an account.",
      ] },
      { heading: "4. Fees", items: [
        "4.1 Fees and package terms are as the Provider publishes on the website or application on the day of the transaction. No fees are charged at present.",
        "4.2 Refunds: the Customer may cancel at any time. The Provider refunds the rest of the current billing cycle using (fee actually paid for that cycle ÷ 30) × days remaining, counted from the day after cancellation to the end of the cycle. The minimum refund is zero baht, and satang are rounded down.",
        "The Service stops on the day of the cancellation notice and ends when the period in clause 7.3 runs out. The Provider checks the facts and amount within 7 days of the notice, then refunds within 15 days of the notice to the PromptPay account set in the system or a bank account the Customer gives, which must be in the same name as the registered Customer. If the name differs, the Provider may hold the refund until further identity checks are complete, to prevent account theft and money laundering. If the Customer withdraws the closure under clause 7.3, no refund is made.",
        "Example: on a 900 baht monthly package, cancelling after 10 days refunds (900 ÷ 30) × 20 = 600 baht.",
        "4.3 Exception: no refund is given where an account is suspended or cancelled because the Customer breached these terms or used the Service unlawfully, under clause 11.1.",
        "4.4 Changing package: the Customer may upgrade at any time by paying (new fee − old fee) ÷ 30 × days remaining in the cycle. The new package applies once paid, and the next cycle uses the new price with the same billing date.",
        "A downgrade applies from the next billing cycle, with no refund of the difference. If the Customer's data exceeds the new package's limits, the Customer must bring it within limits before the downgrade applies.",
        "Example: upgrading from 900 to 1,500 baht a month with 20 days left costs (1,500 − 900) ÷ 30 × 20 = 400 baht.",
        "4.5 The Provider may change fees with at least 30 days' notice.",
      ] },
      { heading: "5. Payments from Guests", items: [
        "5.1 Money Guests pay (PromptPay, transfer or cash) goes directly to the Hotel. The Provider does not receive, hold or transfer money for the Hotel.",
        "5.2 Automatic slip checking uses SlipOK with the Hotel's own API key. The result is an aid. The Hotel remains responsible for checking its own account balance.",
        "5.3 An unpaid online booking holds the room for a short time. When the time ends, the system releases the room.",
        "5.4 Cancellation terms and refunds to Guests are the Hotel's responsibility. The system only records the refund status.",
      ] },
      { heading: "6. The Hotel's duties", items: [
        "6.1 Use the Service lawfully, including hotel law, immigration law (TM.30 reporting) and personal data protection law.",
        "6.2 As data controller for Guests, the Hotel must have a lawful basis to collect data, give Guests its privacy notice, and respond to their requests.",
        "6.3 Check rates and availability in the system from time to time, including bookings taken through channels outside the system, which the Hotel must record or adjust itself.",
        "6.4 Do not use the Service to send spam, deceive people or publish unlawful content on the Hotel's website.",
        "6.5 Keep security measures in place and control the Customer's staff in reaching Guest data and keeping it confidential. If data leaks through the Customer's own devices or people, the Customer is responsible as the law provides.",
      ] },
      { heading: "7. Hotel Data and personal data", items: [
        "7.1 Hotel Data belongs to the Hotel. The Provider uses it only to provide the Service, under the Data Processing Agreement, which forms part of these terms.",
        "7.2 The system keeps each Hotel's data separate. Users reach only the Hotels they have rights to, within the permissions of their role.",
        "7.3 The owner may close a property in the system and may cancel within 7 days of the request. After those 7 days the Service ends for that property. The Hotel may download its data for another 30 days, and the Provider deletes the data within 60 days of the end date, unless the law requires it to be kept. The Hotel must download and keep any records the law requires the Hotel itself to keep.",
      ] },
      { heading: "8. Staff access to data", items: [
        "8.1 Support staff reach a Hotel's data to solve a problem only when the Hotel allows it in the system, as view-only or edit, with an expiry date.",
        "8.2 The Hotel may revoke access at any time, and support access is logged.",
        "8.3 The Provider's administrators do not see bookings or Guest data through the system's screens. The Provider can still reach data at infrastructure level, and does so only as needed to run and secure the system, or to comply with the law or an order of a state authority.",
      ] },
      { heading: "9. Availability", items: [
        "9.1 The Provider tries to keep the Service running but does not guarantee it will be uninterrupted or error-free, because it relies on third-party infrastructure.",
        "9.2 The Provider may pause the Service for maintenance and will give notice where it can.",
      ] },
      { heading: "10. Limit of liability", items: [
        "10.1 The Provider is not liable for indirect, consequential or punitive damages, lost revenue or lost business profits, or for overbooking caused by the Hotel's settings or by bookings through channels outside the system.",
        "10.2 The Provider's total liability is limited to the fees the Customer actually paid in the 12 months before the event, or over the actual period of use if shorter.",
        "10.3 Clauses 10.1 and 10.2 do not exclude liability for the Provider's fraud or gross negligence, or any other liability the law does not allow to be limited.",
      ] },
      { heading: "11. Suspension and cancellation", items: [
        "11.1 The Provider may suspend an account that breaches these terms, breaks the law or is overdue, and will give the reason.",
        "11.2 The Hotel may cancel at any time, under the fee terms in clause 4.",
      ] },
      { heading: "12. Intellectual property", items: [
        "12.1 The software, trademarks and system content belong to the Provider. The Hotel has a non-exclusive right to use them while it uses the Service.",
        "12.2 Content the Hotel uploads, such as photos and captions, remains the Hotel's. The Hotel allows the Provider to use it only to show on the Hotel's website and booking pages, and confirms it has the rights to it.",
      ] },
      { heading: "13. Changes to these terms", items: ["13.1 The Provider may change these terms with at least 30 days' notice in the system or by email. Continuing to use the Service after the effective date means accepting the new terms."] },
      { heading: "14. Transfer of rights", items: [
        "14.1 The Provider may transfer its rights and duties, in whole or in part, to a juristic person it sets up or holds shares in, with at least 30 days' notice. The transfer does not affect the Customer's rights, including Hotel Data and refund terms.",
        "14.2 The Customer may not transfer its rights to anyone else without the Provider's written consent.",
      ] },
      { heading: "15. Governing law", items: ["15.1 These terms are governed by and read under Thai law. Any dispute arising from or relating to them falls under the court with jurisdiction over the Provider's domicile, unless applicable law strictly provides otherwise."] },
    ],
  },
  privacy: {
    intro: "Tanutcha Srimanee, provider of Hayhost Thailand (\"we\"), protects personal data under Thailand's Personal Data Protection Act B.E. 2562 (PDPA). This policy explains how we collect, use and disclose personal data.",
    sections: [
      { heading: "1. Who this policy covers", items: [
        "1.1 Accommodation operators, owners and staff with a Hayhost account. We are the data controller.",
        "1.2 Visitors to www.hayhostth.com and people who contact us. We are the data controller.",
        "1.3 Hotel guests. Each hotel is the data controller, and we process guest data as a data processor on the hotel's instructions. Guests should also read that hotel's privacy notice and send requests to the hotel first. The exception is technical data taken when an online booking is made, which we keep for system security as data controller.",
      ] },
      { heading: "2. What we collect", items: ["Users must give a name and email, and hotels must give their property details, to enter the contract and use the service. Without them we cannot open an account or provide the service."], table: { head: ["Group", "Data", "Source"], rows: [
        ["User accounts", "Name, email, password, two-factor data, role and permissions", "The user / a hotel invite"],
        ["System use", "IP address, browser details, a log of important use (audit log), and technical data to prevent abnormal use", "Automatic"],
        ["Website visits", "Cookie-free visit statistics", "Automatic"],
        ["Hotel details", "Name, address, owner contact, PromptPay account, how they found us", "The hotel"],
        ["Fee refunds", "Refund account name and number, and identity documents when the account name differs from the registered name", "The hotel"],
        ["Sales agents", "Name, phone, email", "The agent or us"],
        ["Guest data (as processor)", "Booker's name, stay dates, number of guests, booking and payment status, slip data and check results, marketing consent, and for TM.30: full name, gender, passport number, nationality, date of birth, phone", "The hotel / the guest on the booking page"],
      ] } },
      { heading: "3. Purposes and legal bases", table: { head: ["Purpose", "Legal basis"], rows: [
        ["Create and run accounts, provide the contracted service, send invite and password emails", "Contract (s. 24(3))"],
        ["Keep the system secure, prevent unauthorised access, keep audit logs", "Legitimate interest (s. 24(5))"],
        ["Issue invoices and keep accounting records", "Legal duty (s. 24(6))"],
        ["Keep data identifying service users for 90 days after they leave, under section 26 of the Computer-Related Crime Act", "Legal duty (s. 24(6))"],
        ["Check refund accounts, and prevent account theft and money laundering", "Contract (s. 24(3)) and legitimate interest (s. 24(5))"],
        ["Send product news to hotels", "Consent or legitimate interest"],
        ["Process guest data", "On the hotel's instructions (data controller) under the Data Processing Agreement"],
      ] } },
      { heading: "4. Disclosure", items: [
        "4.1 We do not sell personal data.",
        "4.2 We disclose data to the service providers needed to run the service, in the groups in clause 12.",
        "4.3 We disclose data to state authorities when the law requires it.",
      ] },
      { heading: "5. Transfers abroad", items: ["5.1 Some of our providers process data outside Thailand, such as in the USA, so cloud infrastructure and email services may store or send data on servers abroad. We transfer data under sections 28 and 29 and the Personal Data Protection Committee's 2023 notifications on transfers abroad, with safeguards under international standard contract clauses with the provider receiving the data."] },
      { heading: "6. How long we keep data", items: ["When a hotel closes, the system deletes that hotel's data automatically under the Data Processing Agreement. When a period below ends, we destroy the data or make it unidentifiable on the system's processing cycle."], table: { head: ["Data", "Period"], rows: [
        ["User accounts", "While the service is used. When an account is deleted, the holder's identity is removed, while booking, financial and audit records stay, with the holder removed as far as the system can match them. Free text typed into them may still contain a name"],
        ["Data identifying service users (such as registered email, period of use and IP)", "90 days from the day the user leaves, under section 26 of the Computer-Related Crime Act. During this time we cannot delete it on request, under section 33 paragraph 2 of the PDPA"],
        ["Sessions and IP", "For the life of the session"],
        ["Audit logs and support access logs", "3 years from the entry, for security and to protect legal claims, or until the property is deleted, whichever comes first"],
        ["Accounting records, invoices, payment records, slips and fee refund data", "5 years, for tax review under the Revenue Code"],
        ["Guest data", "As the hotel decides, and under the Data Processing Agreement on leaving the service"],
      ] } },
      { heading: "7. Security", items: [
        "7.1 We use suitable technical and organisational measures, such as encrypted transport, separation of each hotel's data, role-based permissions and access logs.",
        "7.2 If a breach affects data we control, we will notify the Personal Data Protection Committee office without delay, within 72 hours of becoming aware where feasible, unless it poses no risk to people's rights and freedoms. If the risk is high, we will also tell the people affected and how to remedy it. For guest data, we tell the hotel under the Data Processing Agreement.",
      ] },
      { heading: "8. Cookies and browser storage", items: [
        "8.1 We use cookies needed for sign-in and session security. We do not use advertising cookies.",
        "8.2 We keep your choices, such as language and current hotel, in your browser, and count visits without cookies. If we add analytics or advertising that need cookies, we will ask for consent first.",
      ] },
      { heading: "9. Your rights and data deletion", items: [
        "9.1 You may ask to access and copy, correct, delete or destroy, or restrict the use of your data, object to processing, move your data, and withdraw consent. We reply without delay: within 30 days for access and copies (extendable by up to 30 days if needed, with notice), and within 90 days for deletion, from the day we receive the request.",
        "9.2 Account holders can delete their own account on the security settings page, or email support@hayhostth.com from the account's address with the subject \"Data deletion request\".",
        "9.3 Hotel guests should contact the hotel directly. If you send a request to us, we will pass it to the hotel and help it respond.",
        "9.4 You may complain to the Personal Data Protection Committee office.",
      ] },
      { heading: "10. Contact", items: ["10.1 Data controller: Tanutcha Srimanee (Hayhost Thailand), 41/3 Moo 5, Pang Mu, Mueang Mae Hong Son, Mae Hong Son. Phone: 061-512-5679. Email: support@hayhostth.com"] },
      { heading: "11. Changes to this policy", items: ["11.1 We may update this policy and will announce important changes in the system or by email, with the effective date."] },
      { heading: "12. Service providers", table: { head: ["Provider group", "Used for", "Location"], rows: [
        ["Cloud provider", "Hosting, data and file storage, visit statistics", "Inside and outside Thailand, including the USA"],
        ["Email provider", "System email, and receiving email sent to our team", "Outside Thailand, including the USA"],
       ["Slip checking provider", "Checking transfer slips, when the hotel turns it on", "Company based in Thailand"],
      ] } },
    ],
  },
  dpa: {
    intro: "This agreement forms part of the terms of service, between the Hotel (\"Controller\") and Hayhost (\"Processor\"), under section 40 of the PDPA.",
    sections: [
      { heading: "1. Scope", items: [
        "1.1 Guests' personal data (name, booking details, payment and slip data, TM.30 data, marketing consent) and hotel staff data that the Hotel records.",
        "1.2 Purpose: only to provide the service under the terms of service. Duration: while the service is used and during return or deletion under clause 7.",
      ] },
      { heading: "2. The Processor's duties", items: [
        "2.1 Process data only on the Controller's written instructions, unless an instruction is against the law. This agreement, settings and use of the system count as instructions.",
        "2.2 Not use Guest data for its own purposes, including marketing or training AI models.",
        "2.3 Bind staff who reach the data to confidentiality.",
        "2.4 Keep the security measures in clause 7 of the Privacy Policy.",
        "2.5 Keep a record of processing activities under section 40(3).",
      ] },
      { heading: "3. The Controller's duties", items: [
        "3.1 Have a lawful basis to collect Guest data, and give Guests the Hotel's privacy notice.",
        "3.2 Set user permissions properly, and should use two-factor authentication for users with high privileges.",
      ] },
      { heading: "4. Sub-processors", items: [
        "4.1 The Controller allows sub-processors in the groups in clause 12 of the Privacy Policy, and the Processor gives their names when the Controller asks.",
        "4.2 The Processor gives 30 days' notice before adding or changing a sub-processor. The Controller may object on reasonable grounds.",
      ] },
      { heading: "5. Transfers abroad", items: ["5.1 The Processor transfers data abroad only through the sub-processors in clause 4, and under sections 28 and 29 and the related Personal Data Protection Committee notifications."] },
      { heading: "6. Staff access", items: [
        "6.1 Support staff reach Hotel data only when the Hotel allows it in the system, limited by mode (view-only or edit) and time, revocable, and logged.",
        "6.2 Administrators' screens do not show bookings or Guest data. The Controller allows the Processor to reach the database at infrastructure level only as needed to run and secure the system, or to comply with the law.",
      ] },
      { heading: "7. Ending and deletion", items: ["7.1 When the service ends under clause 7.3 of the terms of service, the Processor lets the Controller export data within 30 days, then deletes it within 60 days of the end date, including from backups on their normal cycle, unless the law requires it to be kept. Until that cycle ends, the Processor does not access or use those backups."] },
      { heading: "8. Breach notice", items: ["8.1 The Processor tells the Controller without delay, within 48 hours of becoming aware, with the information available, so the Controller can notify the office within 72 hours."] },
      { heading: "9. Help for the Controller", items: ["9.1 The Processor helps answer Guests' requests, such as export, correction or deletion, and gives the information needed to show compliance with this agreement."] },
    ],
  },
};

export const legalContent = { th, en };
