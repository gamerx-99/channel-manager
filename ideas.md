# แนวทางออกแบบ Channel Manager MVP

## สามแนวทางที่พิจารณา

### Theme Name: Quiet Ledger

Very Brief Intro: แดชบอร์ดโทนกระดาษบัญชีร่วมสมัย ใช้พื้นขาวนวล หมึกเข้ม และเส้นแบ่งบางเพื่อให้ข้อมูลโรงแรมอ่านง่ายและไว้วางใจได้

Probability: 0.07

### Theme Name: Monsoon Signal

Very Brief Intro: ระบบภายในโทนเข้มที่ใช้สีเขียวทะเลและส้มอำพันเป็นจุดสัญญาณ เหมาะกับข้อมูลสถานะและงานปฏิบัติการที่ต้องเห็นความผิดปกติเร็ว

Probability: 0.04

### Theme Name: Field Notes

Very Brief Intro: ภาษาภาพแบบสมุดบันทึกการเดินทาง ใช้สีดิน ภาพโรงแรมแบบ editorial และแผงข้อมูลที่มีจังหวะไม่สมมาตร เพื่อเชื่อม back office กับประสบการณ์ที่พักจริง

Probability: 0.08

## Approach Chosen: Quiet Ledger

### Design Movement

Swiss editorial information design ผสมกับ hospitality operations dashboard โดยใช้โครงสร้างแบบ asymmetric editorial แทนการจัดทุกอย่างเป็นกล่องการ์ดที่เท่ากัน

### Core Principles

1. **Calm under pressure:** ข้อมูลสำคัญต้องชัดแต่ไม่ตะโกน ใช้ hierarchy และ whitespace แทนการใช้สีแรงทุกจุด
2. **Traceable actions:** ทุกการแก้ไขราคา ห้องว่าง การจอง และ TM.30 ต้องมีบริบท วันที่ และสถานะให้ตรวจย้อนกลับได้
3. **Hotel-first warmth:** แม้เป็น back office ต้องมีภาพและข้อความที่ทำให้รู้ว่านี่คือเครื่องมือของคนดูแลที่พัก ไม่ใช่ spreadsheet เปล่า ๆ
4. **Dense when useful:** ตารางและปฏิทินใช้พื้นที่แน่นอย่างมีระบบ แต่ส่วนสรุปและ action หลักจะมีพื้นที่หายใจชัดเจน

### Color Philosophy

พื้นหลักเป็น **warm paper** (`#F6F4EF`) เพื่อสื่อความสงบและความเป็นเอกสารปฏิบัติงาน หมึกหลักเป็น charcoal navy (`#1F2933`) เพื่ออ่านได้นาน สีเขียวสน (`#1F6B5C`) เป็น signature color สำหรับ availability และสถานะที่พร้อมใช้งาน ส่วน amber (`#C88936`) ใช้เฉพาะ warning/งานที่ต้องตรวจ เช่นข้อมูล TM.30 ไม่ครบ หลีกเลี่ยง gradient สีม่วงและสี accent ที่แย่งความสนใจจากตัวเลข

### Layout Paradigm

ใช้ **rail-and-canvas**: sidebar แคบที่เป็นสมอการนำทาง, content canvas เยื้องซ้ายเล็กน้อย และแผงสรุปแนวตั้งที่ใช้เป็น operational index ด้านขวาบน หน้ารายละเอียดโรงแรมจะเริ่มด้วย hotel identity strip และต่อด้วยแท็บการทำงาน ไม่ใช้ hero แบบศูนย์กลางเต็มหน้า ตาราง booking จะอยู่ใน canvas กว้างแบบ editorial พร้อม action bar ที่แยกชัดจากข้อมูล

### Signature Elements

1. **Ledger rule:** เส้นแนวตั้ง/แนวนอนสีหมึกอ่อนและ label ตัวพิมพ์เล็กแบบ uppercase แบ่งช่วงข้อมูลเหมือนเอกสารบัญชี
2. **Date stamp:** วันที่และช่วงวันที่แสดงในรูปแบบ stamp ที่มีวงเล็บและสีอ่อน ช่วยให้รู้ว่าตัวเลขเป็น snapshot ของวันใด
3. **Signal dot:** จุดสถานะขนาดเล็กที่มีสีตาม semantic state ใช้คู่กับข้อความเสมอ ไม่พึ่งสีเพียงอย่างเดียว

### Interaction Philosophy

การกดปุ่มต้องให้ความรู้สึกเหมือนยืนยันรายการในสมุดงาน: active state สั้นและชัด, form feedback อยู่ใกล้ field, destructive action มี confirmation ที่อธิบายผล ไม่ใช้ animation ยาวหรือ modal ซ้อนหลายชั้น การ export TM.30 จะมี preflight checklist ก่อนสร้างไฟล์เพื่อสะท้อนแนวคิด traceable actions

### Animation

ใช้ entrance fade/translate ระยะสั้น 180–240ms ใน header และ summary blocks; table row hover ใช้ background shift 120ms; dialog ใช้ scale จาก 0.96 + opacity 0 เป็น 1 ภายใน 220ms; ปุ่ม active ใช้ scale 0.98 ประมาณ 140ms; stagger ไม่เกิน 40ms ต่อรายการ ใช้เฉพาะ initial summary ไม่ใช้กับตารางยาว ทุก animation ปิดเมื่อ `prefers-reduced-motion: reduce`

### Typography System

ใช้ **DM Sans** สำหรับ body, table, form และตัวเลขเพื่อความคมชัด และ **Fraunces** สำหรับชื่อโรงแรม/section display ที่ต้องการ warmth แต่ใช้เฉพาะระดับหัวเรื่อง ไม่ใช้ Inter ใช้ type scale: eyebrow 11px uppercase tracking 0.14em, body 14–15px, table 13px, section heading 24–32px, page title 42px บน desktop และ 32px บน mobile

### Brand Essence

Channel Manager คือ **สมุดปฏิบัติการกลางสำหรับเจ้าของโรงแรมที่ต้องการควบคุมราคา ห้องว่าง และการเข้าพักด้วยข้อมูลที่ตรวจสอบได้ โดยไม่ต้องพึ่งทีม support มากรอกแทน**

Personality: steady, precise, hospitable

### Brand Voice

หัวข้อสั้นและเป็นกริยา; CTA ระบุผลลัพธ์จริง; microcopy สุภาพ ตรง และไม่โทษผู้ใช้ หลีกเลี่ยงคำกว้างอย่าง “เริ่มต้นวันนี้”

ตัวอย่าง: “ตรวจห้องว่างของวันนี้” และ “ข้อมูลแขกยังไม่ครบ 3 รายการ — แก้ไขก่อนสร้างไฟล์ TM.30”

### Wordmark & Logo

ใช้ wordmark ที่ประกอบด้วยตัวพิมพ์เล็กแบบ custom grotesk พร้อมเครื่องหมาย **ledger notch**: สี่เหลี่ยมมุมซ้ายบนที่ถูกตัดเป็นรอยเว้าเล็ก ๆ สื่อถึงช่องวันที่ในสมุดบัญชี เครื่องหมายนี้จะใช้เป็น favicon และ avatar ของระบบโดยไม่ใส่ตัวอักษรลงใน icon

### Signature Brand Color

**Pine Ledger — `#1F6B5C`** เป็นสีเขียวสนที่ใช้แทนความพร้อมใช้งาน ความมั่นคง และความเป็น hospitality operations ใช้เป็น accent หลักบนปุ่ม action สำคัญและ availability state อย่างมีสัดส่วน

## Style Decisions

- Back office ใช้ light paper canvas + charcoal ink + pine green signal; ไม่ใช้ dark neon เป็น default
- Public hotel page ใช้ภาพ editorial และ navigation ที่อบอุ่นกว่า dashboard แต่ยังยึด typography และ signature color เดียวกัน
- TM.30 เป็น workflow ที่ sensitive: ใช้ amber warning และ checklist ไม่ใช้ red สำหรับทุก validation
- ทุกไฟล์ component/page/CSS ที่แก้ไขต้องมี comment สั้นด้านบนเตือนแนวทาง Quiet Ledger ของไฟล์นั้น
- Back-office shell ต้องแสดง custom lowercase wordmark และ ledger notch ใน rail/topbar; breadcrumb เป็นเพียง orientation
- Ledger surfaces ใช้เส้น rule, uppercase metadata, bracketed labels, date stamps และ signal dots เป็นหลักแทน generic rounded SaaS cards
- Microcopy หลังบ้านต้องระบุ operational object และ next outcome อย่างตรงไปตรงมา
