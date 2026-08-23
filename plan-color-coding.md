# แผนงาน: Color Coding สำหรับ Dashboard Calendar View

## เป้าหมาย

ปรับปรุง `DashboardCalendarView` ให้ผู้ใช้แยกแยะสถานะห้องว่างในแต่ละวันได้ทันทีด้วยสีที่มีความหมายชัดเจน โดยคง data contract และสิทธิ์แบบ property-scoped เดิมไว้ ไม่เปลี่ยนกติกาการคำนวณ availability หรือ workflow แก้ไขห้องว่างและ Stop Sell ที่มีอยู่แล้ว

## สถานะปัจจุบันและการตัดสินใจสำคัญ

ปฏิทินปัจจุบันมีสถานะเชิงข้อมูลอยู่แล้ว ได้แก่ `healthy`, `low` และ `closed` โดย backend คำนวณจากจำนวนห้องว่างเทียบกับ inventory รวม และ component ใช้ class สถานะดังกล่าวกับเซลล์ปฏิทิน ปัจจุบัน CSS เน้นเปลี่ยนสีตัวเลขเป็นหลัก จึงจะเพิ่มพื้นหลังอ่อน เส้นขอบ และ indicator ที่อ่านได้ชัดขึ้นโดยไม่เปลี่ยน threshold ฝั่ง backend

ความหมายสีที่ใช้คือ **เขียว**สำหรับห้องว่างเพียงพอ (`healthy`), **เหลือง/อำพัน**สำหรับห้องเหลือน้อย (`low`), และ **แดง/โทน clay**สำหรับห้องเต็มหรือไม่มีห้องขาย (`closed`) ส่วนสถานะ **Stop Sell** จะยังคงใช้สัญลักษณ์และข้อความเดิมร่วมกับโทนปิดขาย เพื่อไม่ให้ผู้ใช้เข้าใจว่าเป็นเพียงห้องเต็มตาม occupancy อย่างเดียว สีจะไม่เป็นตัวบอกสถานะเพียงอย่างเดียว แต่จะใช้ร่วมกับจำนวนห้องว่าง, label, icon หรือ `aria-label`

## ขั้นตอนการดำเนินงาน

### 1. ตรวจสอบและล็อก data mapping

ตรวจสอบ `DashboardCalendarView.tsx`, dashboard calendar procedure และ test contract เดิมให้ยืนยันว่า class `healthy`, `low`, `closed` มาจากข้อมูลจริงและยังผูกกับโรงแรมที่ผู้ใช้มีสิทธิ์เห็นเท่านั้น หากไม่จำเป็นจะไม่แก้ backend, RLS หรือ mutation เพราะงานนี้เป็นการปรับการนำเสนอผลลัพธ์

### 2. ปรับโครงสร้างการแสดงผลของเซลล์ปฏิทิน

เพิ่ม semantic hook หรือ data attribute สำหรับสถานะแต่ละเซลล์ และทำให้เซลล์แสดงทั้งสี, จำนวนห้องว่าง และข้อความสถานะที่สื่อความหมาย เช่น `Healthy`, `Low availability`, `Full/Closed` รวมถึงคง selected-day, hover, focus-visible และ sync marker ให้ไม่ถูกกลืนด้วยพื้นหลังใหม่

### 3. ปรับ legend และ visual tokens

ขยาย legend ให้แสดง swatch ของสถานะจริงทั้งสามแบบ พร้อมข้อความอธิบายภาษาอังกฤษ/ภาษาไทยตามภาษาของ UI ที่ใช้อยู่ และใช้ CSS variables หรือสีที่สอดคล้องกับ token เดิมแทนการกระจายค่าสีแบบ ad hoc เพิ่ม contrast ของตัวเลขและเส้นขอบสำหรับพื้นหลังอ่อน โดยตรวจให้สีเหลืองไม่กลืนกับข้อความและสีแดงไม่ทำให้สถานะ error ของ iCal สับสน

### 4. รองรับ accessibility และ interaction states

เพิ่ม `aria-label` หรือ visually hidden status text ให้เซลล์ที่เป็นปุ่ม/interactive เพื่อให้ผู้ใช้ keyboard และ screen reader ทราบวัน, room type, จำนวนห้องว่าง และสถานะโดยไม่ต้องพึ่งสี เพิ่ม focus ring ที่มองเห็นได้ และคงหลักการที่สีไม่ใช่สัญญาณเพียงช่องทางเดียว รวมถึงตรวจ selected state และ sync marker ให้ยังอ่านได้

### 5. ตรวจ responsive behavior

ปรับเฉพาะ CSS ที่จำเป็นสำหรับ desktop, tablet และ mobile โดยคง horizontal-scroll ของ matrix, legend wrapping, touch target และ quick-action panel เดิม ตรวจไม่ให้สีพื้นหลังเพิ่มปัญหา contrast, clipping หรือทำให้รายละเอียด selected-day ล้น viewport

### 6. เพิ่ม regression tests

เพิ่ม contract tests สำหรับ mapping ของ `healthy/low/closed`, class/data attribute ของ color coding, legend ครบทุกสถานะ, accessible status text/aria label และ responsive selectors เดิม ทดสอบให้แน่ใจว่าการเพิ่มสีไม่กระทบ property scope, iCal sync marker, selected-day details หรือ availability quick actions

### 7. ตรวจสอบคุณภาพและบันทึกผล

รัน Vitest ทั้งชุด, TypeScript check และ production build จากนั้นตรวจภาพจริงของ Dashboard Calendar View อย่างน้อย desktop `1280x720`, tablet `768x1024` และ mobile `375x812` หากมี authenticated browser session ให้ตรวจปฏิทินจริง; หากเห็นเฉพาะ sign-in fallback จะบันทึกข้อจำกัดนั้นอย่างตรงไปตรงมา สุดท้ายอัปเดต `todo.md` และบันทึก checkpoint ที่มีข้อความระบุผลการตรวจสอบจริง

## เกณฑ์การยอมรับ

ตารางปฏิทินต้องแยกสถานะห้องว่างได้ทันทีด้วยสีและข้อความร่วมกัน: เขียวสำหรับว่างเพียงพอ, เหลืองสำหรับเหลือน้อย, แดงสำหรับเต็ม/ปิดขาย สีต้องไม่เปลี่ยนสถานะจาก backend และต้องไม่ทำให้ selected-day, iCal marker, quick actions หรือ property filter เสียหาย ผู้ใช้ keyboard และ screen reader ต้องทราบสถานะได้โดยไม่พึ่งการมองเห็นสีเพียงอย่างเดียว

## ความเสี่ยงและสมมติฐาน

สมมติว่า threshold ของ `low` และความหมายของ `closed` ที่ backend ใช้อยู่เป็น business rule ที่ยืนยันแล้ว จึงไม่เปลี่ยนในงานนี้ หากต้องการแยก `full` ออกจาก `stop_sell` เป็นสถานะคนละสี จะต้องเพิ่ม data contract และอาจต้องมี migration/logic change ซึ่งอยู่นอกขอบเขตแผนนี้และควรได้รับการยืนยันก่อน ความเสี่ยงหลักคือสีใหม่อาจชนกับสี error ของ OTA หรือสถานะ selected/focus จึงต้องตรวจ contrast และ interaction states ในขั้น validation
